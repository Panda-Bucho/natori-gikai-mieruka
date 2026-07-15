# -*- coding: utf-8 -*-
"""市町村議会議員選挙の投票率と、執行日の気象データを結合して data/turnout.json を生成する。

出典:
- 投票率: data/turnout_elections.json(手動収集。各市町村選管公表資料・選挙ドットコムより)
- 人口・種別: data/council.json(令和7年国勢調査速報)
- 気象: 気象庁「過去の気象データ検索」日別値ページ(www.data.jma.go.jp/stats/etrn/)
  観測所は市町村ごとに最も近い気温観測地点(気象台/特別地域気象観測所/アメダス)を手動で割り当てる
  (STATIONS/STATION_BY_CODE)。無投票の自治体(投票日なし)は気象取得の対象外。

使い方: python scripts/build_turnout_data.py
再実行しても同じ結果になる(気象データはキャッシュがあれば再取得しない)。
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(BASE, "work", "weather_cache")
TURNOUT_SRC = os.path.join(BASE, "data", "turnout_elections.json")
COUNCIL_JSON = os.path.join(BASE, "data", "council.json")
OUT = os.path.join(BASE, "data", "turnout.json")

# 気温観測のある気象台・特別地域気象観測所・アメダス
# type: 's' = daily_s1.php(気象台・特別地域気象観測所), 'a' = daily_a1.php(アメダス)
# prec: 気象庁の都道府県番号(青森31 / 秋田32 / 岩手33 / 宮城34 / 山形35 / 福島36)
#       アメダスの block は県内でのみ一意のため、prec とセットで指定する
STATIONS = {
    # 宮城県(prec_no=34)
    "sendai":     {"prec": "34", "type": "s", "block": "47590", "name": "仙台"},
    "ishinomaki": {"prec": "34", "type": "s", "block": "47592", "name": "石巻"},
    "shiogama":   {"prec": "34", "type": "a", "block": "1030",  "name": "塩釜"},
    "kesennuma":  {"prec": "34", "type": "a", "block": "0242",  "name": "気仙沼"},
    "shiroishi":  {"prec": "34", "type": "a", "block": "0256",  "name": "白石"},
    "natori":     {"prec": "34", "type": "a", "block": "1464",  "name": "名取"},
    "marumori":   {"prec": "34", "type": "a", "block": "1220",  "name": "丸森"},
    "furukawa":   {"prec": "34", "type": "a", "block": "0247",  "name": "古川"},
    "shizugawa":  {"prec": "34", "type": "a", "block": "0246",  "name": "志津川"},
    "niikawa":    {"prec": "34", "type": "a", "block": "0251",  "name": "新川"},
    "oohira":     {"prec": "34", "type": "a", "block": "0248",  "name": "大衡"},
    "onagawa":    {"prec": "34", "type": "a", "block": "1626",  "name": "女川"},
    "watari":     {"prec": "34", "type": "a", "block": "0257",  "name": "亘理"},
    "tsukidate":  {"prec": "34", "type": "a", "block": "0244",  "name": "築館"},
    "yoneyama":   {"prec": "34", "type": "a", "block": "1029",  "name": "米山"},
    "zaou":       {"prec": "34", "type": "a", "block": "1564",  "name": "蔵王"},
    "kashimadai": {"prec": "34", "type": "a", "block": "0249",  "name": "鹿島台"},

    # 秋田県(prec_no=32)。気象庁「地点の選択」ページ(select/prefecture.php?prec_no=32)の
    # 全地点からf_tem(気温観測フラグ)=1の地点のみ抽出して割当。
    "akita_akita":      {"prec": "32", "type": "s", "block": "47582", "name": "秋田"},
    "akita_noshiro":    {"prec": "32", "type": "a", "block": "0183",  "name": "能代"},
    "akita_yokote":     {"prec": "32", "type": "a", "block": "0198",  "name": "横手"},
    "akita_odate":      {"prec": "32", "type": "a", "block": "0912",  "name": "大館"},
    "akita_oga":        {"prec": "32", "type": "a", "block": "1036",  "name": "男鹿"},
    "akita_yuzawa":     {"prec": "32", "type": "a", "block": "0202",  "name": "湯沢"},
    "akita_kazuno":     {"prec": "32", "type": "a", "block": "0185",  "name": "鹿角"},
    "akita_honjo":      {"prec": "32", "type": "a", "block": "0196",  "name": "本荘"},
    "akita_ogata":      {"prec": "32", "type": "a", "block": "1035",  "name": "大潟"},
    "akita_omagari":    {"prec": "32", "type": "a", "block": "0195",  "name": "大曲"},
    "akita_takanosu":   {"prec": "32", "type": "a", "block": "0184",  "name": "鷹巣"},
    "akita_nikaho":     {"prec": "32", "type": "a", "block": "0199",  "name": "にかほ"},
    "akita_kakunodate": {"prec": "32", "type": "a", "block": "0193",  "name": "角館"},
    "akita_aniai":      {"prec": "32", "type": "a", "block": "1131",  "name": "阿仁合"},
    "akita_hachimori":  {"prec": "32", "type": "a", "block": "1043",  "name": "八森"},
    "akita_gojoume":    {"prec": "32", "type": "a", "block": "0188",  "name": "五城目"},

    # 岩手県(prec_no=33)
    "iwate_morioka":        {"prec": "33", "type": "s", "block": "47584", "name": "盛岡"},
    "iwate_miyako":         {"prec": "33", "type": "s", "block": "47585", "name": "宮古"},
    "iwate_ofunato":        {"prec": "33", "type": "s", "block": "47512", "name": "大船渡"},
    "iwate_hanamaki":       {"prec": "33", "type": "a", "block": "0227",  "name": "花巻"},
    "iwate_kitakami":       {"prec": "33", "type": "a", "block": "0230",  "name": "北上"},
    "iwate_kuji":           {"prec": "33", "type": "a", "block": "0209",  "name": "久慈"},
    "iwate_tono":           {"prec": "33", "type": "a", "block": "0231",  "name": "遠野"},
    "iwate_ichinoseki":     {"prec": "33", "type": "a", "block": "0238",  "name": "一関"},
    "iwate_rikuzentakata":  {"prec": "33", "type": "a", "block": "1629",  "name": "陸前高田"},
    "iwate_kamaishi":       {"prec": "33", "type": "a", "block": "0233",  "name": "釜石"},
    "iwate_ninohe":         {"prec": "33", "type": "a", "block": "0207",  "name": "二戸"},
    "iwate_matsuo":         {"prec": "33", "type": "a", "block": "0214",  "name": "岩手松尾"},
    "iwate_esashi":         {"prec": "33", "type": "a", "block": "0236",  "name": "江刺"},
    "iwate_shizukuishi":    {"prec": "33", "type": "a", "block": "0221",  "name": "雫石"},
    "iwate_kuzumaki":       {"prec": "33", "type": "a", "block": "0211",  "name": "葛巻"},
    "iwate_koma":           {"prec": "33", "type": "a", "block": "1032",  "name": "好摩"},
    "iwate_shiwa":          {"prec": "33", "type": "a", "block": "1128",  "name": "紫波"},
    "iwate_yuda":           {"prec": "33", "type": "a", "block": "0229",  "name": "湯田"},
    "iwate_sumita":         {"prec": "33", "type": "a", "block": "1206",  "name": "住田"},
    "iwate_shinmachi":      {"prec": "33", "type": "a", "block": "1628",  "name": "新町"},
    "iwate_yamada":         {"prec": "33", "type": "a", "block": "1033",  "name": "山田"},
    "iwate_iwaizumi":       {"prec": "33", "type": "a", "block": "0218",  "name": "岩泉"},
    "iwate_omoto":          {"prec": "33", "type": "a", "block": "1212",  "name": "小本"},
    "iwate_fudai":          {"prec": "33", "type": "a", "block": "1123",  "name": "普代"},
    "iwate_karumai":        {"prec": "33", "type": "a", "block": "0206",  "name": "軽米"},
    "iwate_taneichi":       {"prec": "33", "type": "a", "block": "0205",  "name": "種市"},
    "iwate_okunakayama":    {"prec": "33", "type": "a", "block": "1215",  "name": "奥中山"},
}

# 県ごとの登録済み市町村数(データを追加した県のみ検証対象にする)
EXPECTED_BY_PREF = {
    "宮城県": 35,
    "秋田県": 25,
    "岩手県": 33,
}

# 市町村コード(council.json) -> STATIONS のキー。地理的に最も近い気温観測地点を割当
# (市町村自身の観測所が気温非観測、または廃止済みの場合は近隣の観測所で代替)
STATION_BY_CODE = {
    "04100": "sendai",      # 仙台市
    "04202": "ishinomaki",  # 石巻市
    "04203": "shiogama",    # 塩竈市
    "04205": "kesennuma",   # 気仙沼市
    "04206": "shiroishi",   # 白石市
    "04207": "natori",      # 名取市
    "04208": "marumori",    # 角田市
    "04209": "shiogama",    # 多賀城市
    "04211": "natori",      # 岩沼市(自地点は2021年廃止)
    "04212": "yoneyama",    # 登米市(米山は市内)
    "04213": "tsukidate",   # 栗原市(築館は市内)
    "04214": "ishinomaki",  # 東松島市(自地点は2021年廃止)
    "04215": "furukawa",    # 大崎市(古川は市内)
    "04216": "niikawa",     # 富谷市
    "04301": "zaou",        # 蔵王町
    "04302": "shiroishi",   # 七ヶ宿町
    "04321": "shiroishi",   # 大河原町
    "04322": "shiroishi",   # 村田町
    "04323": "shiroishi",   # 柴田町
    "04324": "shiroishi",   # 川崎町(自地点は2021年廃止)
    "04341": "marumori",    # 丸森町
    "04361": "watari",      # 亘理町
    "04362": "watari",      # 山元町
    "04401": "shiogama",    # 松島町
    "04404": "shiogama",    # 七ヶ浜町
    "04406": "shiogama",    # 利府町
    "04421": "oohira",      # 大和町
    "04422": "oohira",      # 大郷町
    "04424": "oohira",      # 大衡村(大衡は村内)
    "04444": "furukawa",    # 色麻町
    "04445": "furukawa",    # 加美町(自地点は気温非観測)
    "04501": "kashimadai",  # 涌谷町
    "04505": "kashimadai",  # 美里町
    "04581": "onagawa",     # 女川町(女川は町内)
    "04606": "shizugawa",   # 南三陸町(志津川は町内)
}

# 秋田県分(地理的に最も近い気温観測地点を割当)
STATION_BY_CODE.update({
    "05201": "akita_akita",      # 秋田市
    "05202": "akita_noshiro",    # 能代市
    "05203": "akita_yokote",     # 横手市
    "05204": "akita_odate",      # 大館市
    "05206": "akita_oga",        # 男鹿市
    "05207": "akita_yuzawa",     # 湯沢市
    "05209": "akita_kazuno",     # 鹿角市
    "05210": "akita_honjo",      # 由利本荘市(市役所=旧本荘市)
    "05211": "akita_ogata",      # 潟上市
    "05212": "akita_omagari",    # 大仙市(市役所=旧大曲市)
    "05213": "akita_takanosu",   # 北秋田市(市役所=旧鷹巣町)
    "05214": "akita_nikaho",     # にかほ市
    "05215": "akita_kakunodate", # 仙北市(市役所=旧角館町)
    "05303": "akita_kazuno",     # 小坂町(鹿角市に隣接)
    "05327": "akita_aniai",      # 上小阿仁村(北秋田市阿仁合に隣接)
    "05346": "akita_noshiro",    # 藤里町(自地点=藤里は気温非観測のため能代で代替)
    "05348": "akita_noshiro",    # 三種町
    "05349": "akita_hachimori",  # 八峰町
    "05361": "akita_gojoume",    # 五城目町
    "05363": "akita_ogata",      # 八郎潟町(旧八郎潟湖畔、大潟に近接)
    "05366": "akita_ogata",      # 井川町(旧八郎潟湖畔、大潟に近接)
    "05368": "akita_ogata",      # 大潟村
    "05434": "akita_omagari",    # 美郷町(大仙市に隣接)
    "05463": "akita_yuzawa",     # 羽後町(湯沢市に隣接)
    "05464": "akita_yuzawa",     # 東成瀬村(自地点=東成瀬は気温非観測のため湯沢で代替)
})

# 岩手県分(地理的に最も近い気温観測地点を割当)
STATION_BY_CODE.update({
    "03201": "iwate_morioka",       # 盛岡市
    "03202": "iwate_miyako",        # 宮古市
    "03203": "iwate_ofunato",       # 大船渡市
    "03205": "iwate_hanamaki",      # 花巻市
    "03206": "iwate_kitakami",      # 北上市
    "03207": "iwate_kuji",          # 久慈市
    "03208": "iwate_tono",          # 遠野市
    "03209": "iwate_ichinoseki",    # 一関市
    "03210": "iwate_rikuzentakata", # 陸前高田市
    "03211": "iwate_kamaishi",      # 釜石市
    "03213": "iwate_ninohe",        # 二戸市
    "03214": "iwate_matsuo",        # 八幡平市(旧松尾村域)
    "03215": "iwate_esashi",        # 奥州市(旧江刺市域)
    "03216": "iwate_morioka",       # 滝沢市(自地点は気温非観測のため盛岡で代替、盛岡市に隣接)
    "03301": "iwate_shizukuishi",   # 雫石町
    "03302": "iwate_kuzumaki",      # 葛巻町
    "03303": "iwate_koma",          # 岩手町(好摩に近接)
    "03321": "iwate_shiwa",         # 紫波町
    "03322": "iwate_morioka",       # 矢巾町(盛岡市に隣接)
    "03366": "iwate_yuda",          # 西和賀町(旧湯田町域)
    "03381": "iwate_kitakami",      # 金ケ崎町(自地点は気温非観測のため北上で代替)
    "03402": "iwate_ichinoseki",    # 平泉町(一関市に隣接)
    "03441": "iwate_sumita",        # 住田町
    "03461": "iwate_shinmachi",     # 大槌町(自地点=大槌は気温非観測のため町内の新町で代替)
    "03482": "iwate_yamada",        # 山田町
    "03483": "iwate_iwaizumi",      # 岩泉町
    "03484": "iwate_omoto",         # 田野畑村(岩泉町小本に近接)
    "03485": "iwate_fudai",         # 普代村
    "03501": "iwate_karumai",       # 軽米町
    "03503": "iwate_kuji",          # 野田村(久慈市に隣接)
    "03506": "iwate_karumai",       # 九戸村(軽米町に隣接)
    "03507": "iwate_taneichi",      # 洋野町(旧種市町域)
    "03524": "iwate_okunakayama",   # 一戸町(町内の奥中山)
})

# daily_s1.php(気象台) / daily_a1.php(アメダス) の列インデックス(0始まり)
# pandas.read_html で列を確認済み: 日, 降水量-合計, 気温-平均
COLS = {
    "s": {"day": 0, "precip": 3, "temp_avg": 6},
    "a": {"day": 0, "precip": 1, "temp_avg": 4},
}


def fetch_month_html(prec, stype, block, year, month):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{prec}_{stype}_{block}_{year}{month:02d}.html")
    if os.path.exists(path):
        return path
    page = "daily_s1.php" if stype == "s" else "daily_a1.php"
    url = f"https://www.data.jma.go.jp/stats/etrn/view/{page}?prec_no={prec}&block_no={block}&year={year}&month={month}&day=&view="
    print(f"download weather: {stype} {block} {year}-{month:02d}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; natori-gikai-mieruka data builder)"})
    with urllib.request.urlopen(req, timeout=30) as res:
        html = res.read()
    with open(path, "wb") as f:
        f.write(html)
    return path


def parse_num(v, zero_dash=False):
    """気象庁の日別値表記を数値に変換。"--"は降水なし(0.0)/微量値、"///"は欠測(気象庁の凡例による)。
    zero_dash=True の列(降水量)では "--" を 0.0 として扱う。"""
    s = str(v).strip()
    if s in ("", "///", "nan", "×"):
        return None
    if s == "--":
        return 0.0 if zero_dash else None
    try:
        return float(s)
    except ValueError:
        return None


def get_weather(station_key, date_str):
    """station_key の date_str(YYYY-MM-DD) 当日の {precip, tempAvg} を返す(欠測時は該当値がnull)"""
    import pandas as pd

    st = STATIONS[station_key]
    y, m, d = (int(x) for x in date_str.split("-"))
    path = fetch_month_html(st["prec"], st["type"], st["block"], y, m)
    tables = pd.read_html(path, attrs={"id": "tablefix1"})
    df = tables[0]
    row = df.iloc[d - 1]
    cols = COLS[st["type"]]
    assert int(row.iloc[cols["day"]]) == d, f"day mismatch: {row.iloc[cols['day']]} != {d}"
    return {
        "station": st["name"],
        "precip": parse_num(row.iloc[cols["precip"]], zero_dash=True),
        "tempAvg": parse_num(row.iloc[cols["temp_avg"]]),
    }


def main():
    with open(TURNOUT_SRC, encoding="utf-8") as f:
        turnout_src = json.load(f)
    with open(COUNCIL_JSON, encoding="utf-8") as f:
        council = json.load(f)
    council_by_code = {m["code"]: m for m in council["municipalities"]}

    municipalities = []
    for e in turnout_src["elections"]:
        c = council_by_code.get(e["code"])
        if c is None:
            print(f"WARN: council.json に無いコード {e['code']} {e['name']} をスキップ")
            continue
        entry = {
            "code": e["code"],
            "name": e["name"],
            "pref": c["pref"],
            "type": c["type"],
            "pop": c["pop"],
            "election": e["election"],
            "date": e["date"],
            "turnout": e["turnout"],
            "uncontested": e["uncontested"],
            "source": e["source"],
        }
        if not e["uncontested"] and e.get("date"):
            station_key = STATION_BY_CODE.get(e["code"])
            assert station_key, f"観測所未割当: {e['code']} {e['name']}"
            entry["weather"] = get_weather(station_key, e["date"])
        else:
            entry["weather"] = None
        municipalities.append(entry)

    print(f"processed: {len(municipalities)} / {len(turnout_src['elections'])}")

    # 検証
    natori = next(m for m in municipalities if m["code"] == "04207")
    assert natori["turnout"] == 35.55, natori
    assert natori["weather"]["precip"] == 61.5 and natori["weather"]["tempAvg"] == 6.9, natori["weather"]
    print(f"名取市: 投票率{natori['turnout']}% 気象(名取観測所)={natori['weather']}")
    for pref, expected in EXPECTED_BY_PREF.items():
        n = len([m for m in municipalities if m["pref"] == pref])
        assert n == expected, f"{pref} {n}団体 (expected {expected})"
    with_weather = [m for m in municipalities if m["weather"]]
    print(f"気象データ取得: {len(with_weather)}件(無投票を除く)")

    jst = timezone(timedelta(hours=9))
    data = {
        "generatedAt": datetime.now(jst).isoformat(timespec="seconds"),
        "note": turnout_src.get("note", ""),
        "weatherSource": "気象庁「過去の気象データ検索」(www.data.jma.go.jp/stats/etrn/)。投票日当日の観測値。降水量は日合計(mm)、気温は日平均(℃)。天気(晴/雨)そのものは観測されないため代替指標として使用",
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
