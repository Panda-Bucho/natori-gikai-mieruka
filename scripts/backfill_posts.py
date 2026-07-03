# -*- coding: utf-8 -*-
"""RSSフィードのページ送り(WordPressの ?paged=N)で過去の投稿を遡取するスクリプト。

通常のRSSは直近10件程度しか配信しないため、月別集計の長期表示(任期4年の推移)用に
過去分を一度だけ取り込む。日次の update_posts.py は既存履歴を保持したまま新着を
積み上げるので、本スクリプトの実行は原則1回でよい(フィード追加時に再実行)。

- 空ページ、全エントリがカットオフ(前任期開始 2020-02-01)より古いページ、
  または上限ページ数に達したら次のフィードへ
- ページ間に1秒スリープ(取得先サーバーへの配慮)
"""

import sys
import time

from update_posts import MEMBERS_PATH, POSTS_PATH, entry_date_jst, fetch_feed, load_json, write_posts

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

CUTOFF_DATE = "2020-02-01"  # 前任期の開始月より古い投稿は対象外
MAX_PAGES = 150
SLEEP_SEC = 1.0


def paged_url(url, page):
    if page == 1:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}paged={page}"


def backfill_feed(member, feed, posts_by_url):
    """1フィードをページ送りで遡取し、posts_by_url に追記する。追加件数を返す。"""
    url = feed["url"]
    platform = feed.get("platform", "website")
    added = 0
    prev_links = None
    for page in range(1, MAX_PAGES + 1):
        try:
            parsed = fetch_feed(paged_url(url, page))
        except Exception as e:
            # 末尾ページ超過は404等になる。それ以外もそこで打ち切り
            print(f"    page {page}: 取得終了 ({type(e).__name__})")
            break
        if not parsed.entries:
            print(f"    page {page}: エントリなしで終了")
            break

        links = {(e.get("link") or "").strip() for e in parsed.entries}
        if links == prev_links:
            # 末尾ページを繰り返し返すCMS対策
            print(f"    page {page}: 前ページと同一内容のため終了")
            break
        prev_links = links

        page_dates = []
        for entry in parsed.entries:
            link = (entry.get("link") or "").strip()
            date = entry_date_jst(entry)
            if not link or not date:
                continue
            page_dates.append(date)
            if date < CUTOFF_DATE or link in posts_by_url:
                continue
            title = (entry.get("title") or "").strip() or "(無題)"
            posts_by_url[link] = {
                "date": date,
                "platform": platform,
                "title": title,
                "url": link,
            }
            added += 1

        if page_dates and max(page_dates) < CUTOFF_DATE:
            print(f"    page {page}: カットオフ({CUTOFF_DATE})到達で終了")
            break
        time.sleep(SLEEP_SEC)
    return added


def main():
    members_data = load_json(MEMBERS_PATH, None)
    if members_data is None:
        print(f"members.json が見つかりません: {MEMBERS_PATH}", file=sys.stderr)
        sys.exit(1)

    old = load_json(POSTS_PATH, {"members": {}, "errors": []})
    old_members = old.get("members", {})

    new_members = {}
    total_added = 0
    for member in members_data["members"]:
        mid = member["id"]
        existing = old_members.get(mid, {}).get("posts", [])
        posts_by_url = {p["url"]: p for p in existing}
        feeds = member.get("feeds", [])
        if feeds:
            print(f"{member['name']}")
            for feed in feeds:
                added = backfill_feed(member, feed, posts_by_url)
                total_added += added
                print(f"  {feed['url']}: +{added}件")
        posts = sorted(posts_by_url.values(), key=lambda p: (p["date"], p["url"]), reverse=True)
        new_members[mid] = {
            "lastPostDate": posts[0]["date"] if posts else None,
            "posts": posts,
        }

    # errors は日次更新の状態を表すためそのまま引き継ぐ
    write_posts(new_members, old.get("errors", []))
    total = sum(len(m["posts"]) for m in new_members.values())
    print(f"done: +{total_added}件 追加、合計 {total}件 -> {POSTS_PATH}")


if __name__ == "__main__":
    main()
