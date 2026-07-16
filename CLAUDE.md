# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Codeの応答ルール

- **思考中の解説を含め、日本語で応答すること。**
- **プランモードでプランを提示する際は、実行時にどのモデルを使うかを提案とともに尋ねること**(トークン消費を抑えるため、実行フェーズだけ軽量モデルに切り替える等の検討をユーザーができるようにする)。
- **チャット返信内のURLはmarkdownリンク形式で、前後に句読点や括弧を密着させないこと**。例：❌「[URL](https://example.com/)で」のように句読点を直後に続ける → ✓「[URL](https://example.com/) で」のように空白を置く。理由：素のURLに隣接する文字がリンク判定に巻き込まれ、クリックしても開けなくなる。

## プロジェクト概要

これは**静的HTML/CSS/JSサイト**(ビルド不要・フレームワークなし)で、名取市議会議員の活動と議会の姿を可視化します。RSSフィード・議会映像配信サイト・政府統計などの公開情報を集約し、インタラクティブな表・グラフとして表示します。

**7ページ構成:**
- `index.html` — 議員一覧(得票結果、年齢、期数、委員会所属、媒体リンク)
- `stats.html` — 月別発信回数(棒グラフ + データ表)
- `questions.html` — 一般質問の登壇状況(マトリクス、散布図、ワードクラウド、テーマ一覧)
- `question.html` — 個別の質問詳細・AI要約
- `council.html` — 議員定数の妥当性(全国市区町村との人口1000人あたり議員数比較)
- `salary.html` — 議員報酬の妥当性(全国市区町村との報酬月額比較、議員/副議長/議長切替)
- `turnout.html` — 議員選挙の投票率比較(東北6県227市町村、投票日の気象との関係、出典表)

**データソース:** 議員メタデータ(手動JSON)、RSSフィード(ブログ・公式サイト)、議会映像配信サイトAPI、国勢調査、議長会調査。

**ホスティング:** GitHub Pages + GitHub Actions(JST 6:00に日次データ更新)。

## ディレクトリ構成

```
├── .github/workflows/update.yml     # 日次データ取得(RSS + 議会スクレイプ)
├── .claude/launch.json              # 開発サーバー設定
├── README.md                        # ユーザー向けドキュメント
│
├── index.html, stats.html, questions.html, question.html, council.html, salary.html, turnout.html
├── css/style.css                    # 単一スタイルシート(全ページ共通)
├── js/
│   ├── common.js                    # 共通ユーティリティ: データ取得・日付処理・グラフ補助
│   ├── main.js                      # 議員一覧(ソート・詳細展開)
│   ├── stats.js                     # 月別発信回数(グラフ・期間切替)
│   ├── questions.js                 # 質問マトリクス・散布図・ワードクラウド
│   ├── question.js                 # 質問詳細ページ
│   ├── council.js                   # 議員定数の散布図(対数軸+べき乗近似)
│   ├── salary.js                    # 議員報酬の散布図(横軸対数+べき乗近似)
│   └── turnout.js                   # 投票率の散布図(人口×投票率、気象×投票率)、出典表
├── data/
│   ├── members.json                 # 手動管理: 議員メタデータ・媒体URL・RSSフィード
│   ├── posts.json                   # 自動生成: RSS発信履歴(update_posts.py)
│   ├── questions.json               # 自動生成: 議会映像スクレイプ(update_questions.py)
│   ├── summaries.json               # 自動生成: AI要約(make_summaries.py)
│   ├── council.json                 # 自動生成: 市区町村の人口・議員定数データ(build_council_data.py)
│   ├── salary.json                  # 自動生成: 市区町村の議員報酬データ(build_salary_data.py)
│   ├── turnout_elections.json       # 手動収集: 東北6県227市町村の直近議員選挙の投票率(選管公表資料・選挙ドットコム)
│   └── turnout.json                 # 自動生成: 投票率+人口+投票日の気象データ(build_turnout_data.py)
├── scripts/
│   ├── update_posts.py              # RSS集計
│   ├── update_questions.py          # 議会映像API + 会議録スクレイプ
│   ├── build_council_data.py        # 国勢調査・議長会データのダウンロードと集計
│   ├── build_salary_data.py         # 議長会報酬データのダウンロードと集計
│   ├── build_turnout_data.py        # turnout_elections.json + council.json + 気象庁データを結合
│   ├── backfill_posts.py            # 過去投稿の遡取(新規フィード追加時に1回実行)
│   ├── fetch_qa_texts.py            # 会議録から質疑テキストを抽出(要約生成の下準備)
│   └── make_summaries.py            # AI要約生成(手動実行)
└── work/
    ├── council_src/                 # 国勢調査・議長会Excelのダウンロードキャッシュ
    ├── weather_cache/                # 気象庁 日別値ページのダウンロードキャッシュ
    └── minutes_cache/               # 会議録のキャッシュ
```

**重要:** `work/` は `.gitignore` 対象(一時データキャッシュ)。永続データはすべて `data/` に置く。

## データアーキテクチャ

### データフロー

```
data/members.json                    # 手動編集
         ↓
   RSSフィード(ブログ・サイト)
         ↓
   議会映像API + 会議録
         ↓
scripts/update_posts.py       →  data/posts.json
scripts/update_questions.py   →  data/questions.json
scripts/fetch_qa_texts.py     →  質問テキストキャッシュ
scripts/make_summaries.py     →  data/summaries.json (Claude API)
scripts/build_council_data.py →  data/council.json(国勢調査+議長会調査)
scripts/build_salary_data.py  →  data/salary.json(議長会報酬調査、data/council.jsonのpopを再利用)
scripts/build_turnout_data.py →  data/turnout.json(data/turnout_elections.json手動収集+council.jsonのpop+気象庁日別値)
         ↓
JSページ(main.js, stats.js, questions.js等)
         ↓
レンダリング済みHTML(クライアントサイド、fetch() + DOM)
```

### データ構造

**members.json**(手動):
```json
{
  "id": "yoshida-ryo",
  "name": "吉田 良",
  "kana": "よしだ りょう",
  "faction": "名和会",
  "birthDate": "1971-05-10",
  "terms": 3,
  "links": {
    "website": "https://...",
    "blog": null,
    "x": "https://x.com/..."
  },
  "feeds": [
    { "platform": "website", "url": "https://.../feed/" }
  ],
  "lastElection": {
    "votes": 1234.5,
    "share": 5.42
  },
  "manual": [
    { "platform": "x", "lastPostDate": "2026-06-20", "checkedDate": "2026-07-01" }
  ]
}
```

**posts.json**(自動):
```json
{
  "generatedAt": "2026-07-12T06:30:00Z",
  "members": {
    "yoshida-ryo": [
      { "date": "2026-07-10", "title": "...", "url": "https://...", "platform": "blog" }
    ]
  },
  "errors": ["RSS fetch failed for ..."]
}
```

**questions.json**(自動):
```json
{
  "generatedAt": "2026-07-12T06:30:00Z",
  "members": {
    "yoshida-ryo": [
      {
        "id": "123456",
        "definiteTermName": "令和6年2月定例会",
        "date": "2026-02-15",
        "url": "https://natori-city.stream.jfit.co.jp/?tpl=play_vod&inquiry_id=123456",
        "minutesUrl": "https://www.city.natori.miyagi.dbsr.jp/...",
        "theme": "防災対策の充実について"
      }
    ]
  }
}
```

**council.json**(自動):
```json
{
  "generatedAt": "2026-07-12T16:00:00Z",
  "basisPopulation": "2025-10-01",
  "basisSeats": "2025-12-31",
  "bracketLabels": { "A": "人口5万未満", "B": "人口5万〜10万未満", "...": "..." },
  "municipalities": [
    { "code": "04201", "name": "名取市", "pref": "宮城県", "type": "市", "pop": 79000, "seats": 21, "bracket": "B" }
  ]
}
```
`bracket` は市・特別区にのみ付与(全国市議会議長会の人口段階区分、salary.jsonと同じ8区分)。町村にはない。

**salary.json**(自動):
```json
{
  "generatedAt": "2026-07-12T16:00:00Z",
  "basisCity": "2025-12-31",
  "basisTown": "2025-07-01",
  "bracketLabels": { "A": "人口5万未満", "B": "人口5万〜10万未満", "...": "..." },
  "municipalities": [
    { "code": "04207", "name": "名取市", "pref": "宮城県", "type": "市", "pop": 79817, "gicho": 504000, "fuku": 420000, "giin": 395000, "bracket": "B" }
  ]
}
```

**turnout_elections.json**(手動収集。市町村選管公表資料・選挙ドットコムより):
```json
{
  "note": "収集方法・無投票の扱い等の説明",
  "elections": [
    { "code": "04207", "name": "名取市", "election": "名取市議会議員一般選挙", "date": "2024-01-21",
      "eligible": 64624, "voters": 22972, "turnout": 35.55, "uncontested": false,
      "source": "https://www.city.natori.miyagi.jp/uploaded/attachment/15481.pdf" }
  ]
}
```
`eligible`/`voters` は判明したもののみ(多くは null)。`uncontested: true` の場合 `turnout` は null。

**turnout.json**(自動。turnout_elections.json + council.jsonのpop + 気象庁データを結合):
```json
{
  "generatedAt": "2026-07-15T10:00:00+09:00",
  "note": "...", "weatherSource": "...",
  "municipalities": [
    { "code": "04207", "name": "名取市", "pref": "宮城県", "type": "市", "pop": 78737,
      "election": "名取市議会議員一般選挙", "date": "2024-01-21", "turnout": 35.55,
      "uncontested": false, "source": "https://...",
      "weather": { "station": "名取", "precip": 61.5, "tempAvg": 6.9 } }
  ]
}
```
`weather` は無投票自治体では null。観測所は市町村ごとに地理的に近い気温観測地点を `scripts/build_turnout_data.py` 内の `STATION_BY_CODE` で手動割当。

## 開発ワークフロー

### ローカルセットアップ

```bash
# Python依存パッケージのインストール
pip install -r requirements.txt

# データ更新スクリプトの実行
python scripts/update_posts.py
python scripts/update_questions.py

# ローカルサーバー起動(fetchはhttp://が必要、file://では動かない)
python -m http.server 8000
# → ブラウザで http://localhost:8000 を開く
```

または `.claude/launch.json` の開発サーバーを使う:
```bash
# Claude Code内で:
/preview_start name:site
```

### よくある作業

**議員のRSSフィードを追加・更新する:**
1. `data/members.json` を編集 — `feeds` 配列にプラットフォームとRSS URLを追加
2. `python scripts/update_posts.py` をローカルで実行して動作確認
3. `members.json` をコミット

**議員メタデータの更新(氏名・生年月日・会派・選挙結果):**
- `data/members.json` を直接編集。出典は議会公式サイト + 選挙管理委員会の結果

**スクレイパー変更後にデータキャッシュを更新する:**
- `work/council_src/` や `work/minutes_cache/` 配下のディレクトリを削除して再ダウンロードを強制
- 該当スクリプトを再実行

**質問要約の更新:**
- `scripts/make_summaries.py` を修正し `python scripts/make_summaries.py` で実行(Anthropic Claude APIキーが必要)

**過去投稿の遡取(新規RSSフィード追加時に1回):**
- `python scripts/backfill_posts.py` をローカルで実行し `data/posts.json` をコミット

### キャッシュバスティング

**重要:** JSまたはCSSを変更した場合、**7つのHTMLファイルすべて**(`index.html`, `stats.html`, `questions.html`, `question.html`, `council.html`, `salary.html`, `turnout.html`)の `?v=` パラメータを必ずバンプすること。

形式: `?v=YYYYMMDD<文字>`(例: `?v=20260712a`、同日に再更新するなら `20260712b`)

理由: GitHub Pagesは600秒のmax-ageを持つ。バンプを忘れると、訪問者が新しいHTMLと古いキャッシュ済みJS/CSSの組み合わせを見てしまい、ページが壊れる。パラメータのバンプで強制的に再取得させる。

**運用ルール:**
- `css/style.css` の変更 → 7つのHTMLすべての `?v=` をバンプ
- `.js` ファイルの変更 → 7つのHTMLすべての `?v=` をバンプ(すべてが対象ファイルを参照しているため)
- `data/*.json` の変更 → **バンプ不要**(common.js の `fetchJson` が `cache: no-cache` を使用)

### 共通ユーティリティ(js/common.js)

新しいJSを書く前に、`common.js` に既存のヘルパーがないか確認する:

- `fetchJson(path)` — no-cacheでfetch(データファイル用)
- `loadData()` — `{members, posts}` を返す
- `parseDate(s)` → Dateオブジェクト(ローカルタイム0時)
- `daysAgo(dateStr)` → 整数またはnull
- `formatDateJa(dateStr)` → "YYYY/MM/DD"
- `calcAge(birthDate)` → 現在の年齢(birthDateから自動計算)
- `freshnessClass(dateStr)` → CSSクラス("fresh-7", "fresh-30"等)
- `formatVotesHtml(v)` — 小数部分を小さいフォントで表示
- `formatShareHtml(v)` — "X.XX%"形式で表示
- `regressionLine(points, xMin, xMax)` → 散布図の近似線用に `{points: [...], slope, intercept, r2}` を返す
- `monthKey(year, month)` → "YYYY-MM"
- `monthKeysBetween(startKey, endKey)` → 月キーの配列
- `recentMonthKeys(n)` → 直近n か月(当月含む)

**新しい共通ユーティリティは、ページ固有の `.js` ファイルではなく `common.js` に追加すること。**

## アーキテクチャ上の決定事項

1. **ビルド不要:** HTML/CSS/JSをそのまま配信。デプロイがシンプルで、反復が速い。

2. **クライアントサイドレンダリング:** 各ページが `fetch()` でデータを取得しDOMで描画(テンプレートエンジンなし)。トレードオフとして初期HTMLは小さくなるが、JS必須(グラフのalt属性・適切なARIAラベルでアクセシビリティを担保)。

3. **Chart.js 4.4.3(CDN):** 唯一の外部JS依存。デュアル軸描画・散布図・ワードクラウドはページ固有の `.js` 内でプラグインやカスタム設定を使用。

4. **単一CSSファイル:** `css/style.css` を全ページで共有。デザインの一貫性・保守性は高いが、カスケードによる副作用に注意。

5. **散布図のジッターアルゴリズム:** 複数のデータ点が同座標で重なる場合、jitterStep分だけ横にずらす。`questions.js` では真偽値のジッターから、軸ごとに間隔を調整できる数値ステップ(0, 0.15, 0.5)に変更済み。

6. **役職によるデータ除外:** 一般質問の散布図の近似線は、役職(議長・副議長・監査委員)経験者を除外して計算(慣例として質問を控えるためバイアスがかかる)。グレー四角で識別表示し、点としては含めるが回帰計算からは除く。

7. **アクセシビリティ:** すべてのインタラクティブ要素にグラフの `aria-label`、`role="img"`、注記セクションでの代替説明を用意。

## デプロイ

**手動push(テスト用):**
```bash
git add <files>
git commit -m "メッセージ\n\nCo-Authored-By: Claude <noreply@anthropic.com>"
git pull --rebase origin main
git push origin main
```

**自動(日次):**
- GitHub ActionsがJST 6:00に実行(`update.yml`)
- `update_posts.py` と `update_questions.py` を実行
- 変更があれば `data/posts.json` と `data/questions.json` を自動コミット
- GitHub Pagesが自動的に再デプロイ

## 主要なURL・参照先

- **名取市議会 映像配信サイト:** https://natori-city.stream.jfit.co.jp/
- **会議録検索システム:** https://www.city.natori.miyagi.dbsr.jp/
- **選挙結果:** https://www.city.natori.miyagi.jp/uploaded/attachment/15481.pdf
- **議員プロフィール(公式):** https://www.city.natori.miyagi.jp/page/3547.html
- **公開サイト:** https://panda-bucho.github.io/natori-gikai-mieruka/

## よくある落とし穴

- **`?v=` のバンプ忘れ:** 訪問者が新HTML+旧JS/CSSを見てしまい、ページが壊れる
- **`posts.json` / `questions.json` を手動編集:** 自動生成ファイルのため、手動編集は上書きされる。代わりに手動管理の `members.json` を編集すること
- **RSSフィードURLの誤り:** フィードは有効なXMLを返す必要がある。事前にブラウザで確認すること
- **スクリプトのキャッシュ破損:** `work/` ディレクトリは一時的なもの。コミットに含めないこと(`.gitignore` 対象済み)
- **ローカルテストの省略:** `python -m http.server 8000` を使うこと。file:// URLでは `fetch()` が動かない
