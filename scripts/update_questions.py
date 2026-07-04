# -*- coding: utf-8 -*-
"""名取市議会 映像配信サイトから議員別の一般質問履歴を取得し data/questions.json を生成する。

- members.json の speakerId ごとに 議員別検索ページ(?tpl=speaker_result&speaker_id=N)を取得
- 「本会議 一般質問」の行から 定例会名・日付・質問テーマ(大項目)を抽出
- リクエスト間に1秒スリープ(取得先サーバーへの配慮)
- 取得失敗は errors に記録して継続(ワークフローは失敗させない)
"""

import json
import re
import sys
import time
from datetime import datetime

import requests

from update_posts import JST, MEMBERS_PATH, ROOT, USER_AGENT, load_json

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

QUESTIONS_PATH = ROOT / "data" / "questions.json"
BASE_URL = "https://natori-city.stream.jfit.co.jp/"
TIMEOUT = 30
SLEEP_SEC = 1.0

ROW_RE = re.compile(r'<tr class="font-90">(.*?)</tr>', re.S)
LI_RE = re.compile(r"<li>(.*?)</li>", re.S)
TOPIC_TD_RE = re.compile(r'<td class="font-tt left">(.*?)</td>', re.S)
ASSEMBLY_RE = re.compile(r"(令和|平成)(\d+)年第(\d+)回(定例会|臨時会)")
DATE_RE = re.compile(r"(\d+)月(\d+)日")
# 大項目: 全角数字+全角スペースで始まる行
TOPIC_RE = re.compile(r"^[０-９]+　(.+)$")


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
        entries.append({
            "assembly": assembly,
            "date": date,
            "topics": topics,
            "url": page_url,
        })
    entries.sort(key=lambda e: e["date"], reverse=True)
    return entries


def main():
    members_data = load_json(MEMBERS_PATH, None)
    if members_data is None:
        print(f"members.json が見つかりません: {MEMBERS_PATH}", file=sys.stderr)
        sys.exit(1)

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
            old = load_json(QUESTIONS_PATH, {"members": {}})
            entries = old.get("members", {}).get(member["id"], [])
        result[member["id"]] = entries
        print(f"{member['name']}: {len(entries)}回")
        time.sleep(SLEEP_SEC)

    out = {
        "generatedAt": datetime.now(JST).isoformat(timespec="seconds"),
        "source": "名取市議会映像配信 " + BASE_URL,
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
