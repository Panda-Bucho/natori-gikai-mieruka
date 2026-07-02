# -*- coding: utf-8 -*-
"""RSS/Atomフィードを巡回して data/posts.json を更新するスクリプト。

- data/members.json の feeds に登録されたフィードを取得
- エントリ日付をJSTの日付文字列(YYYY-MM-DD)に正規化
- 既存の data/posts.json とマージ(記事URLで重複排除)して履歴を蓄積
- 取得失敗はメンバー単位で errors に記録し、処理は継続する
"""

import calendar
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser
import requests

# Windowsのコンソール(cp932)でも日本語ログが化けないようにする
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

JST = timezone(timedelta(hours=9), "JST")
ROOT = Path(__file__).resolve().parent.parent
MEMBERS_PATH = ROOT / "data" / "members.json"
POSTS_PATH = ROOT / "data" / "posts.json"

USER_AGENT = "NatoriGikaiWatchBot/1.0 (+https://github.com/; RSS collector for civic info site)"
TIMEOUT = 20


def load_json(path, default):
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def entry_date_jst(entry):
    """フィードエントリの日付をJSTの YYYY-MM-DD 文字列にして返す。日付がなければ None。"""
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    # feedparser はタイムゾーン付き日付をUTCの struct_time に正規化する
    epoch = calendar.timegm(parsed)
    return datetime.fromtimestamp(epoch, tz=JST).strftime("%Y-%m-%d")


def fetch_feed(url):
    resp = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    parsed = feedparser.parse(resp.content)
    if parsed.bozo and not parsed.entries:
        raise ValueError(f"feed parse error: {parsed.bozo_exception}")
    return parsed


def collect_member_posts(member, existing_posts, errors):
    """1議員分のフィードを取得し、既存履歴とマージした投稿リストを返す。"""
    posts_by_url = {p["url"]: p for p in existing_posts}
    for feed in member.get("feeds", []):
        url = feed["url"]
        platform = feed.get("platform", "website")
        try:
            parsed = fetch_feed(url)
        except Exception as e:
            errors.append({
                "memberId": member["id"],
                "feedUrl": url,
                "error": f"{type(e).__name__}: {e}",
            })
            print(f"  [ERROR] {member['name']} {url}: {e}", file=sys.stderr)
            continue
        for entry in parsed.entries:
            link = (entry.get("link") or "").strip()
            date = entry_date_jst(entry)
            if not link or not date:
                continue
            if link in posts_by_url:
                continue  # 既存エントリを優先(履歴の安定性を保つ)
            title = (entry.get("title") or "").strip() or "(無題)"
            posts_by_url[link] = {
                "date": date,
                "platform": platform,
                "title": title,
                "url": link,
            }
    posts = sorted(posts_by_url.values(), key=lambda p: (p["date"], p["url"]), reverse=True)
    return posts


def main():
    members_data = load_json(MEMBERS_PATH, None)
    if members_data is None:
        print(f"members.json が見つかりません: {MEMBERS_PATH}", file=sys.stderr)
        sys.exit(1)

    old = load_json(POSTS_PATH, {"members": {}})
    old_members = old.get("members", {})

    errors = []
    new_members = {}
    for member in members_data["members"]:
        mid = member["id"]
        existing = old_members.get(mid, {}).get("posts", [])
        print(f"{member['name']} ({len(member.get('feeds', []))} feeds)")
        posts = collect_member_posts(member, existing, errors)
        new_members[mid] = {
            "lastPostDate": posts[0]["date"] if posts else None,
            "posts": posts,
        }

    out = {
        "generatedAt": datetime.now(JST).isoformat(timespec="seconds"),
        "members": new_members,
        "errors": errors,
    }
    POSTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(POSTS_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    total = sum(len(m["posts"]) for m in new_members.values())
    print(f"done: {total} posts, {len(errors)} errors -> {POSTS_PATH}")
    if errors:
        # フィード取得失敗があってもワークフローは失敗させない(errorsとして記録済み)
        for e in errors:
            print(f"  error: {e['memberId']} {e['feedUrl']}", file=sys.stderr)


if __name__ == "__main__":
    main()
