# -*- coding: utf-8 -*-
"""市区町村の議員報酬(議長・副議長・議員)を集計して data/salary.json を生成する。

出典(2ソース、work/council_src/ にキャッシュ):
- 市区: 全国市議会議長会「市議会議員報酬に関する調査結果【別表】」(令和7年12月31日現在)
  https://www.si-gichokai.jp/research/teisu/__icsFiles/afieldfile/2026/06/04/20260604_housyu_tyousa.xlsx
- 町村: 全国町村議会議長会「第71回町村議会実態調査」(令和7年7月1日現在) ※定数取得と同一ファイル
  https://www.nactva.gr.jp/html/research/pdf/71_2.xls

人口・市区町村名は data/council.json(令和7年国勢調査速報)の値を再利用し、(都道府県, 正規化名) で突合する。

人口段階(市区のみ。全国市議会議長会の別表「人口段階」列による区分):
  A:5万未満 B:5万〜10万未満 C:10万〜20万未満 D:20万〜30万未満
  E:30万〜40万未満 F:40万〜50万未満 G:50万以上(指定都市を除く) H:指定都市

使い方: python scripts/build_salary_data.py
再実行しても同じ結果になる(キャッシュがあれば再ダウンロードしない)。
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "work", "council_src")
COUNCIL_JSON = os.path.join(BASE, "data", "council.json")
OUT = os.path.join(BASE, "data", "salary.json")

FILES = {
    "sigichokai_housyu.xlsx": "https://www.si-gichokai.jp/research/teisu/__icsFiles/afieldfile/2026/06/04/20260604_housyu_tyousa.xlsx",
    "nactva_71_2.xls": "https://www.nactva.gr.jp/html/research/pdf/71_2.xls",
}

BRACKET_LABELS = {
    "A": "人口5万未満",
    "B": "人口5万〜10万未満",
    "C": "人口10万〜20万未満",
    "D": "人口20万〜30万未満",
    "E": "人口30万〜40万未満",
    "F": "人口40万〜50万未満",
    "G": "人口50万以上(指定都市を除く)",
    "H": "指定都市",
}


def fetch_sources():
    os.makedirs(SRC, exist_ok=True)
    for name, url in FILES.items():
        path = os.path.join(SRC, name)
        if os.path.exists(path):
            continue
        print(f"download: {name}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; natori-gikai-mieruka data builder)"})
        with urllib.request.urlopen(req, timeout=60) as res, open(path, "wb") as f:
            f.write(res.read())


def norm(name):
    """突合用の名称正規化(表記ゆれ: ヶ/ケ・ヵ/カ・空白)"""
    return re.sub(r"[\s　]", "", str(name)).replace("ヶ", "ケ").replace("ヵ", "カ")


def load_city_salary():
    """(pref, 正規化市名) -> {bracket, gicho, fuku, giin}(報酬月額円、815市区)"""
    import openpyxl
    wb = openpyxl.load_workbook(os.path.join(SRC, "sigichokai_housyu.xlsx"), read_only=True)
    ws = wb.worksheets[0]
    out = {}
    # ヘッダー: 都道府県名, 市名, 人口段階, 人口, 議長_報酬月額, 副議長_報酬月額, 議員_報酬月額, ...
    for row in ws.iter_rows(min_row=5, max_col=8, values_only=True):
        _, pref, city, bracket, pop, gicho, fuku, giin = row
        if not pref or not city:
            continue
        out[(str(pref).strip(), norm(city))] = {
            "bracket": str(bracket).strip() if bracket else None,
            "gicho": int(gicho) if gicho not in (None, "") else None,
            "fuku": int(fuku) if fuku not in (None, "") else None,
            "giin": int(giin) if giin not in (None, "") else None,
        }
    wb.close()
    assert len(out) >= 810, f"city salary = {len(out)} (expected ~815)"
    return out


def load_town_salary():
    """(pref, 正規化町村名) -> {gicho, fuku, giin}(報酬月額円、~926町村)

    列構成(3行の結合ヘッダー、0始まり): 0=都道府県名 1=町村名 4=定数
    9=議長報酬月額 13=副議長報酬月額 17=議員報酬月額(いずれも減額条例適用前の額)。データは6行目(index 5)から。
    """
    import xlrd
    wb = xlrd.open_workbook(os.path.join(SRC, "nactva_71_2.xls"))
    ws = wb.sheet_by_index(0)

    def val(r, c):
        v = ws.cell_value(r, c)
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None

    out = {}
    for r in range(5, ws.nrows):
        pref = str(ws.cell_value(r, 0)).strip()
        town = str(ws.cell_value(r, 1)).strip()
        if not pref.endswith(("都", "道", "府", "県")) or not town:
            continue
        out[(pref, norm(town))] = {"gicho": val(r, 9), "fuku": val(r, 13), "giin": val(r, 17)}
    assert len(out) >= 920, f"town salary = {len(out)} (expected ~926)"
    return out


def main():
    fetch_sources()
    with open(COUNCIL_JSON, encoding="utf-8") as f:
        council = json.load(f)

    city_salary = load_city_salary()
    town_salary = load_town_salary()

    municipalities = []
    unmatched = []
    for m in council["municipalities"]:
        key = (m["pref"], norm(m["name"]))
        s = city_salary.get(key) if m["type"] in ("市", "特別区") else town_salary.get(key)
        if s is None or s.get("giin") is None:
            unmatched.append(f"{m['pref']} {m['name']} ({m['type']})")
            continue
        entry = {
            "code": m["code"],
            "name": m["name"],
            "pref": m["pref"],
            "type": m["type"],
            "pop": m["pop"],
            "gicho": s["gicho"],
            "fuku": s["fuku"],
            "giin": s["giin"],
        }
        if m["type"] in ("市", "特別区") and s.get("bracket"):
            entry["bracket"] = s["bracket"]
        municipalities.append(entry)

    print(f"matched: {len(municipalities)} / {len(council['municipalities'])}")
    if unmatched:
        print("unmatched:")
        for u in unmatched:
            print("  ", u)

    # 検証
    natori = next(m for m in municipalities if m["code"] == "04207")
    assert natori["name"] == "名取市" and natori["giin"], natori
    print(f"名取市: 議員報酬月額 {natori['giin']:,}円(議長{natori['gicho']:,}円・副議長{natori['fuku']:,}円) 人口段階={natori.get('bracket')}")
    miyagi = [m for m in municipalities if m["pref"] == "宮城県"]
    assert len(miyagi) == 35, f"宮城県 {len(miyagi)}団体 (expected 35)"

    jst = timezone(timedelta(hours=9))
    data = {
        "generatedAt": datetime.now(jst).isoformat(timespec="seconds"),
        "basisCity": "全国市議会議長会「市議会議員報酬に関する調査結果」(2025年12月31日現在)",
        "basisTown": "全国町村議会議長会「第71回町村議会実態調査」(2025年7月1日現在)",
        "bracketLabels": BRACKET_LABELS,
        "municipalities": municipalities,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT)
    print(f"wrote {OUT} ({len(municipalities)}件, {size/1024:.0f}KB)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
