# -*- coding: utf-8 -*-
"""会議録検索システムから一般質問の質疑テキスト(質問+答弁の一連)を抽出する。

- questions.json の minutesUrl(#one:発言番号)から 文書Id と発言番号を取得
- 文書HTMLは work/minutes_cache/{docId}.html にキャッシュ(再実行時は再取得しない)
- 質疑スロット = 当人の最初の発言番号 〜 議長の「以上で、◯◯議員の一般質問を終了」の発言
  (定型句は全文書で安定して存在。元議員の質疑や散会あいさつの混入を防ぐ)
- 出力: work/qa_texts/{memberId}_{date}.txt(冒頭に議員名・定例会・日付・テーマのヘッダー)

AI要約(data/summaries.json)の材料を作るための補助スクリプト。work/ はコミットしない。
"""

import html as htmllib
import json
import re
import sys
import time

import requests

from update_posts import MEMBERS_PATH, ROOT, USER_AGENT, load_json
from update_questions import MINUTES_BASE, QUESTIONS_PATH, TIMEOUT, SLEEP_SEC

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

CACHE_DIR = ROOT / "work" / "minutes_cache"
OUT_DIR = ROOT / "work" / "qa_texts"

MINUTES_URL_RE = re.compile(r"Id=(\d+)#one:(\d+)$")
VOICE_BLOCK_RE = re.compile(
    r'<li class="voice-block[^"]*" data-voice_code="(\d+)"[^>]*>.*?'
    r'<p class="voice__text">(.*?)</p>',
    re.S,
)


def clean_voice_text(raw):
    s = re.sub(r"<br\s*/?>", "\n", raw)
    s = re.sub(r"<[^>]+>", "", s)
    s = htmllib.unescape(s)
    return s.strip()


def fetch_doc(session, doc_id):
    cache = CACHE_DIR / f"{doc_id}.html"
    if cache.exists():
        return cache.read_text(encoding="utf-8")
    resp = session.get(f"{MINUTES_BASE}?Template=document&Id={doc_id}", timeout=TIMEOUT)
    resp.raise_for_status()
    cache.write_text(resp.text, encoding="utf-8")
    time.sleep(SLEEP_SEC)
    return resp.text


def main():
    members_data = load_json(MEMBERS_PATH, None)
    questions = load_json(QUESTIONS_PATH, None)
    if not members_data or not questions:
        print("members.json / questions.json が読めません", file=sys.stderr)
        sys.exit(1)
    names = {m["id"]: m["name"] for m in members_data["members"]}

    # (date) -> [(voice_code, memberId, entry)] を作りスロット範囲を決める
    by_date = {}
    for mid, entries in questions["members"].items():
        for e in entries:
            m = MINUTES_URL_RE.search(e.get("minutesUrl", ""))
            if not m:
                continue
            by_date.setdefault(e["date"], {"docId": int(m.group(1)), "slots": []})
            by_date[e["date"]]["slots"].append((int(m.group(2)), mid, e))

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    count = 0
    sizes = []
    for date in sorted(by_date):
        info = by_date[date]
        html = fetch_doc(session, info["docId"])
        texts = {int(c): clean_voice_text(t) for c, t in VOICE_BLOCK_RE.findall(html)}
        if not texts:
            print(f"  [WARN] {date}: 発言テキストが取れません (Id={info['docId']})", file=sys.stderr)
            continue
        last_code = max(texts)
        slots = sorted(info["slots"])
        for i, (code, mid, e) in enumerate(slots):
            # 終端: 議長の「〜の一般質問を終了」定型句(見つからなければ次スロット直前/文書末尾)
            end = slots[i + 1][0] - 1 if i + 1 < len(slots) else last_code
            for c in range(code, end + 1):
                if "の一般質問を終了" in texts.get(c, ""):
                    end = c
                    break
            body = "\n\n".join(texts[c] for c in range(code, end + 1) if c in texts)
            # 終了宣言の行より後(議事の区切り線・散会見出し等)を落とす
            m2 = re.search(r"^.*の一般質問を終了.*$", body, re.M)
            if m2:
                body = body[: m2.end()]
            header = (
                f"議員: {names.get(mid, mid)}\n"
                f"定例会: {e['assembly']}\n"
                f"日付: {e['date']}\n"
                f"通告テーマ: {' / '.join(e['topics']) or '(不明)'}\n"
                f"発言範囲: {code}〜{end}(文書Id={info['docId']})\n"
                + "-" * 40 + "\n"
            )
            out = OUT_DIR / f"{mid}_{date}.txt"
            out.write_text(header + body + "\n", encoding="utf-8")
            count += 1
            sizes.append(len(body))
        print(f"{date}: {len(slots)}件 (文書Id={info['docId']})")

    if sizes:
        print(f"done: {count}件 / 平均{sum(sizes)//len(sizes)}字 / 最小{min(sizes)}字 最大{max(sizes)}字 -> {OUT_DIR}")


if __name__ == "__main__":
    main()
