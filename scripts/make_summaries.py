# -*- coding: utf-8 -*-
"""work/summaries/batch_*.json を検証・統合して data/summaries.json を生成する。

- 冪等: 何度でも再実行できる。バッチが増えるたびに実行すればよい
- 検証: summary が文字列(100字以上)、gains が2件以上のリストであること
- 進捗レポート: 全質問(直近5年・議事録公開済み=qa_texts の件数)に対する生成済み数と、
  未生成のバッチ番号を表示する

AI要約の生成そのものは Claude Code のサブエージェントが行う(PROMPT.md 参照)。
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
MODEL = "Claude Sonnet 5 (Anthropic)"


def main():
    entries = {}
    bad = []
    for f in sorted(SUMMARIES_DIR.glob("batch_*.json")):
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            bad.append(f"{f.name}: JSONエラー {e}")
            continue
        for key, v in data.items():
            if not (isinstance(v.get("summary"), str) and len(v["summary"]) >= 100
                    and isinstance(v.get("gains"), list) and len(v["gains"]) >= 2
                    and all(isinstance(g, str) and g for g in v["gains"])):
                bad.append(f"{f.name}: {key} が仕様外")
                continue
            entries[key] = {"summary": v["summary"], "gains": v["gains"]}

    if bad:
        print("[WARN] 仕様外のデータ(除外して続行):", file=sys.stderr)
        for b in bad:
            print("  " + b, file=sys.stderr)

    # 進捗: qa_texts にある全質問のうちどれだけ生成済みか
    all_keys = set()
    for t in QA_TEXTS_DIR.glob("*.txt"):
        stem = t.stem
        all_keys.add(stem[: stem.rfind("_")] + "|" + stem[stem.rfind("_") + 1:])
    missing = sorted(all_keys - set(entries))

    out = {
        "generatedAt": datetime.now(JST).isoformat(timespec="seconds"),
        "model": MODEL,
        "note": "会議録の当該質疑部分からAIが自動生成した要約。全議員を同一の方法で機械的に処理。",
        "entries": dict(sorted(entries.items())),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"生成済み: {len(entries)} / {len(all_keys)}件 -> {OUT_PATH}")
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
