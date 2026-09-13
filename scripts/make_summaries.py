# -*- coding: utf-8 -*-
"""work/summaries/batch_*.json を検証・統合して data/summaries.json を生成する。

- 冪等: 何度でも再実行できる。バッチが増えるたびに実行すればよい
- 検証(仕様外は除外): 通告テーマごとの topics が1件以上。各テーマは title があり、
  summary 100字以上・gains 2〜4件。質疑が行われていないテーマ(summary が定型文)のみ gains 空を許す
- 警告(除外しない): gains の80字超、qa_texts ヘッダーの通告テーマ数と topics 数の不一致
  (会議録の大項目を優先して分けるため、不一致が正しい場合がある。内容を目視確認する)
- 進捗レポート: 全質問(直近5年・議事録公開済み=qa_texts の件数)に対する生成済み数と、
  未生成のバッチ番号を表示する

AI要約の生成そのものは Claude Code のサブエージェントが行う(prompts/summary-prompt.md 参照)。
"""

import json
import pathlib
import sys
from datetime import datetime

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from update_posts import JST, ROOT

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

SUMMARIES_DIR = ROOT / "work" / "summaries"
QA_TEXTS_DIR = ROOT / "work" / "qa_texts"
OUT_PATH = ROOT / "data" / "summaries.json"
MODEL = "Claude Sonnet (Anthropic)"  # バージョン番号は含めない(CLAUDE.md「要約生成のルール」参照)
PROMPT_VERSION = 2  # PROMPT.md を変えたら上げ、全件を作り直す
NO_QA = "会議録上、このテーマの質疑は確認できない。"


def check_entry(v):
    """仕様外なら理由を返す。仕様どおりなら None"""
    topics = v.get("topics") if isinstance(v, dict) else None
    if not isinstance(topics, list) or not topics:
        return "topics がない"
    for i, t in enumerate(topics, 1):
        if not isinstance(t, dict) or not isinstance(t.get("title"), str) or not t["title"].strip():
            return f"テーマ{i}: title がない"
        s, g = t.get("summary"), t.get("gains")
        if not (isinstance(s, str) and isinstance(g, list) and all(isinstance(x, str) and x for x in g)):
            return f"テーマ{i}: summary / gains の型が不正"
        if s == NO_QA:
            if g:
                return f"テーマ{i}: 質疑なしなのに gains がある"
            continue
        if len(s) < 100:
            return f"テーマ{i}: summary が{len(s)}字(100字未満)"
        if not 2 <= len(g) <= 4:
            return f"テーマ{i}: gains が{len(g)}件(2〜4件以外)"
    return None


def header_topic_count(key):
    """qa_texts ヘッダーの通告テーマ数(ファイルがなければ None)"""
    mid, date = key.split("|")
    path = QA_TEXTS_DIR / f"{mid}_{date}.txt"
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("通告テーマ:"):
            return len(line.split(":", 1)[1].split(" / "))
    return None


def main():
    entries = {}
    bad = []
    warn = []
    for f in sorted(SUMMARIES_DIR.glob("batch_*.json")):
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            bad.append(f"{f.name}: JSONエラー {e}")
            continue
        for key, v in data.items():
            reason = check_entry(v)
            if reason:
                bad.append(f"{f.name}: {key} {reason}")
                continue
            topics = [
                {"title": t["title"].strip(), "summary": t["summary"], "gains": t["gains"]}
                for t in v["topics"]
            ]
            long_gains = sum(len(g) > 80 for t in topics for g in t["gains"])
            if long_gains:
                warn.append(f"{f.name}: {key} gains の80字超が{long_gains}件")
            n = header_topic_count(key)
            if n is not None and n != len(topics):
                warn.append(f"{f.name}: {key} 通告テーマ{n}件に対し topics {len(topics)}件(目視確認)")
            entries[key] = {"topics": topics}

    if bad:
        print("[WARN] 仕様外のデータ(除外して続行):", file=sys.stderr)
        for b in bad:
            print("  " + b, file=sys.stderr)
    if warn:
        print("[WARN] 要確認(統合には含める):", file=sys.stderr)
        for w in warn:
            print("  " + w, file=sys.stderr)

    # 進捗: qa_texts にある全質問のうちどれだけ生成済みか
    all_keys = set()
    for t in QA_TEXTS_DIR.glob("*.txt"):
        stem = t.stem
        all_keys.add(stem[: stem.rfind("_")] + "|" + stem[stem.rfind("_") + 1:])
    missing = sorted(all_keys - set(entries))

    out = {
        "generatedAt": datetime.now(JST).isoformat(timespec="seconds"),
        "model": MODEL,
        "promptVersion": PROMPT_VERSION,
        "note": "会議録の当該質疑部分から、通告テーマごとにAIが自動生成した要約。全議員を同一の方法で機械的に処理。",
        "entries": dict(sorted(entries.items())),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"生成済み: {len(entries)} / {len(all_keys)}件 -> {OUT_PATH}")
    lens = [len(t["summary"]) for e in entries.values() for t in e["topics"] if t["summary"] != NO_QA]
    if lens:
        n_gains = [len(t["gains"]) for e in entries.values() for t in e["topics"] if t["summary"] != NO_QA]
        print(f"テーマ数: {len(lens)} / summary 平均{sum(lens) // len(lens)}字(最小{min(lens)} 最大{max(lens)})"
              f" / gains 平均{sum(n_gains) / len(n_gains):.1f}件")
    if missing:
        # 未生成分がどのバッチに属するか
        lists_dir = SUMMARIES_DIR / "batch_lists"
        pending_batches = []
        for lf in sorted(lists_dir.glob("batch_*.txt")):
            names = lf.read_text(encoding="utf-8").split()
            keys = {n[:-4][: n[:-4].rfind("_")] + "|" + n[:-4][n[:-4].rfind("_") + 1:] for n in names}
            if keys - set(entries):
                pending_batches.append(lf.stem)
        print(f"未生成: {len(missing)}件(残バッチ: {', '.join(pending_batches) or 'なし'})")
    else:
        print("全件生成済み。公開(コミット)できます。")


if __name__ == "__main__":
    main()
