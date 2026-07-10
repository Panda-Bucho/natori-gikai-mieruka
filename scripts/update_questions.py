# -*- coding: utf-8 -*-
"""名取市議会 映像配信サイトから議員別の一般質問履歴を取得し data/questions.json を生成する。

- members.json の speakerId ごとに 議員別検索ページ(?tpl=speaker_result&speaker_id=N)を取得
- 「本会議 一般質問」の行から 定例会名・日付・質問テーマ(大項目)・映像直リンク(play_vod)を抽出
- 会議録検索システム(dbsr.jp)から当日の会議録を探し、議員の発言箇所への
  ディープリンク(minutesUrl)を付与。会議録は公開が数か月遅れるため、
  未公開の分は minutesUrl なしのまま毎日の実行で再試行される
- 解決済みの minutesUrl は前回の questions.json から持ち越して再取得しない
- リクエスト間に1秒スリープ(取得先サーバーへの配慮)
- 取得失敗は errors に記録して継続(ワークフローは失敗させない)
"""

import json
import re
import sys
import time
from datetime import datetime, timedelta

import requests

from update_posts import JST, MEMBERS_PATH, ROOT, USER_AGENT, load_json

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

QUESTIONS_PATH = ROOT / "data" / "questions.json"
BASE_URL = "https://natori-city.stream.jfit.co.jp/"
MINUTES_BASE = "https://www.city.natori.miyagi.dbsr.jp/index.php/100000"
TIMEOUT = 30
SLEEP_SEC = 1.0
# 会議録リンクを解決する対象期間(サイトの表示は直近5年。少し余裕を持たせる)
MINUTES_WINDOW_DAYS = 5 * 365 + 60

ROW_RE = re.compile(r'<tr class="font-90">(.*?)</tr>', re.S)
LI_RE = re.compile(r"<li>(.*?)</li>", re.S)
TOPIC_TD_RE = re.compile(r'<td class="font-tt left">(.*?)</td>', re.S)
ASSEMBLY_RE = re.compile(r"(令和|平成)(\d+)年第(\d+)回(定例会|臨時会)")
DATE_RE = re.compile(r"(\d+)月(\d+)日")
# 大項目: 全角数字+全角スペースで始まる行
TOPIC_RE = re.compile(r"^[０-９]+　(.+)$")
# 質問映像の再生ページへの直リンク
PLAY_RE = re.compile(r'href="/\?tpl=play_vod&(?:amp;)?inquiry_id=(\d+)"')
# 会議録検索の結果一覧: 文書リンク(Id)とタイトル(「本文」/「名簿」)
MINUTES_DOC_RE = re.compile(r'Template=document&(?:amp;)?Id=(\d+)[^"]*"[^>]*>([^<]+)</a>')
# 会議録の発言一覧: 発言番号と発言者名(例: ◯13番(吉田 良))
VOICE_RE = re.compile(r'data-voice_code="(\d+)".*?class="speaker__name[^"]*">([^<]*)</span>', re.S)


def to_year(era, n):
    return {"令和": 2018, "平成": 1988}[era] + int(n)


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s).strip()


def parse_speaker_page(html, page_url):
    """議員別ページから一般質問の登壇履歴を抽出する。"""
    entries = []
    for row in ROW_RE.findall(html):
        lis = [strip_tags(x) for x in LI_RE.findall(row)]
        if len(lis) < 3:
            continue
        assembly, date_s, session = lis[0], lis[1], lis[2]
        if "一般質問" not in session:
            continue
        am = ASSEMBLY_RE.search(assembly)
        dm = DATE_RE.search(date_s)
        if not am or not dm:
            continue
        date = f"{to_year(am.group(1), am.group(2))}-{int(dm.group(1)):02d}-{int(dm.group(2)):02d}"

        topics = []
        td = TOPIC_TD_RE.search(row)
        if td:
            for line in re.split(r"<br\s*/?>", td.group(1)):
                m = TOPIC_RE.match(strip_tags(line))
                if m:
                    topics.append(m.group(1).strip())
        # 当該質問の再生ページへの直リンク(無い行は議員別検索ページで代用)
        pm = PLAY_RE.search(row)
        url = f"{BASE_URL}?tpl=play_vod&inquiry_id={pm.group(1)}" if pm else page_url
        entries.append({
            "assembly": assembly,
            "date": date,
            "topics": topics,
            "url": url,
        })
    entries.sort(key=lambda e: e["date"], reverse=True)
    return entries


def normalize_name(s):
    """氏名照合用: 空白(全角含む)を除去する。"""
    return re.sub(r"[\s　]", "", s)


def fetch_minutes_day(session, date, assembly):
    """会議録検索システムから、指定日の本会議会議録(本文)の文書IDと発言一覧を取得する。

    戻り値: (doc_id, [(voice_code, 発言者名(正規化済み)), ...]) / 未公開などで見つからなければ None
    """
    cabinet = 2 if "臨時会" in assembly else 1
    list_url = (f"{MINUTES_BASE}?QueryType=New&Template=List"
                f"&Cabinet={cabinet}&TermStart={date}&TermEnd={date}")
    resp = session.get(list_url, timeout=TIMEOUT)
    resp.raise_for_status()
    doc_id = None
    for did, title in MINUTES_DOC_RE.findall(resp.text):
        if "本文" in title:
            doc_id = did
            break
    if not doc_id:
        return None
    time.sleep(SLEEP_SEC)
    resp = session.get(f"{MINUTES_BASE}?Template=document&Id={doc_id}", timeout=TIMEOUT)
    resp.raise_for_status()
    voices = [(code, normalize_name(strip_tags(name)))
              for code, name in VOICE_RE.findall(resp.text)]
    return doc_id, voices


def resolve_minutes_urls(session, result, members_by_id, errors):
    """minutesUrl が未設定のエントリー(対象期間内)に会議録リンクを付与する。"""
    cutoff = (datetime.now(JST) - timedelta(days=MINUTES_WINDOW_DAYS)).strftime("%Y-%m-%d")
    # 日付ごとにまとめて取得(同じ日の会議録は1回だけ読む)
    pending = {}  # date -> [(member, entry), ...]
    for mid, entries in result.items():
        member = members_by_id.get(mid)
        if not member:
            continue
        for e in entries:
            if e.get("minutesUrl") or e["date"] < cutoff:
                continue
            pending.setdefault((e["date"], e["assembly"]), []).append((member, e))
    if not pending:
        return
    print(f"会議録リンクを解決: {len(pending)}日分")
    for (date, assembly), targets in sorted(pending.items()):
        time.sleep(SLEEP_SEC)
        try:
            found = fetch_minutes_day(session, date, assembly)
        except Exception as e:
            errors.append({"date": date, "source": "minutes",
                           "error": f"{type(e).__name__}: {e}"})
            print(f"  [ERROR] 会議録 {date}: {e}", file=sys.stderr)
            continue
        if found is None:
            print(f"  {date}: 会議録は未公開")
            continue
        doc_id, voices = found
        for member, entry in targets:
            name = normalize_name(member["name"])
            code = next((c for c, n in voices if name in n), None)
            frag = f"#one:{code}" if code else "#one"
            entry["minutesUrl"] = f"{MINUTES_BASE}?Template=document&Id={doc_id}{frag}"
        matched = sum(1 for _, e in targets if "#one:" in e.get("minutesUrl", ""))
        print(f"  {date}: 文書Id={doc_id}, {matched}/{len(targets)}名の発言箇所を特定")


def main():
    members_data = load_json(MEMBERS_PATH, None)
    if members_data is None:
        print(f"members.json が見つかりません: {MEMBERS_PATH}", file=sys.stderr)
        sys.exit(1)

    old = load_json(QUESTIONS_PATH, {"members": {}})
    # 解決済みの会議録リンクは持ち越す(文書IDと発言番号は変わらないため)
    old_minutes = {}
    for mid, entries in old.get("members", {}).items():
        for e in entries:
            if e.get("minutesUrl"):
                old_minutes[(mid, e["date"])] = e["minutesUrl"]

    result = {}
    errors = []
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    for member in members_data["members"]:
        sid = member.get("speakerId")
        if not sid:
            result[member["id"]] = []
            continue
        page_url = f"{BASE_URL}?tpl=speaker_result&speaker_id={sid}"
        try:
            resp = session.get(page_url, timeout=TIMEOUT)
            resp.raise_for_status()
            entries = parse_speaker_page(resp.text, page_url)
        except Exception as e:
            errors.append({"memberId": member["id"], "url": page_url,
                           "error": f"{type(e).__name__}: {e}"})
            print(f"  [ERROR] {member['name']}: {e}", file=sys.stderr)
            entries = None
        if entries is None:
            # 取得失敗時は前回データを維持する
            entries = old.get("members", {}).get(member["id"], [])
        for e in entries:
            carried = old_minutes.get((member["id"], e["date"]))
            if carried and not e.get("minutesUrl"):
                e["minutesUrl"] = carried
        result[member["id"]] = entries
        print(f"{member['name']}: {len(entries)}回")
        time.sleep(SLEEP_SEC)

    members_by_id = {m["id"]: m for m in members_data["members"]}
    resolve_minutes_urls(session, result, members_by_id, errors)

    out = {
        "generatedAt": datetime.now(JST).isoformat(timespec="seconds"),
        "source": f"名取市議会映像配信 {BASE_URL} / 名取市議会会議録検索システム {MINUTES_BASE}",
        "members": result,
        "errors": errors,
    }
    QUESTIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(QUESTIONS_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    total = sum(len(v) for v in result.values())
    print(f"done: {total}件の登壇記録, {len(errors)} errors -> {QUESTIONS_PATH}")


if __name__ == "__main__":
    main()
