# 名取市議会議員 見える化サイト

宮城県名取市の市議会議員(21名)の活動(Web発信状況・議会での一般質問の登壇状況)と議会の姿(議員定数の全国比較)を可視化する、有権者向けの非公式静的サイトです。有権者の市政・選挙への関心を高め、投票率の向上に資することを目的としています。

各一覧は既定で議席番号順に並べ、議席番号を表示しています(掲載順が特定候補への便宜と誤解されないため)。

- **議員一覧** (`index.html`): 現在の任期の残り(任期満了2028年1月31日まで)、議席番号・議員名(議会公式プロフィールへリンク)・会派・年齢・期数・前回市議選の得票数/得票率(名取市選管の開票結果による)・常任委員会・発信媒体リンクのアイコン表示。列見出しクリックでソート、行クリックで全所属委員会・生年月日等の詳細を展開
  - 年齢は生年月日(市議会公式の議員紹介ページ掲載)から自動計算
  - 最終発信日・先月発信回数の列は掲載していません(RSS非対応のSNSで活発に発信している議員が低く見える誤解を避けるため)
- **月別発信回数** (`stats.html`): 議員×月のテーブル + 棒グラフ。期間は「直近12か月 / 今期(2024年2月〜) / 直近4年」を切替可能(選挙4年周期での発信評価用。グラフには選挙月マーカー付き)
- **一般質問** (`questions.html`): 議員×定例会の登壇マトリクス(直近5年、市議選マーカー付き)と質問テーマ一覧。議長・副議長・監査委員の在任中セルには役職名、初当選前のセルには「—」を表示。期数/今期/5年計/得票数/得票率の列でソート可能。得票率×質問回数・期数×質問回数の散布図と、質問テーマのワードクラウド(全議員/議員別切替、wordcloud2.js、語句ハイライト検索つき)も表示。出典は名取市議会映像配信サイトで、各セルから質問映像へリンク
- データは GitHub Actions が **1日1回(JST 6:00)** RSSフィードを巡回して自動更新

ビルド不要の HTML/CSS/JS 構成(グラフのみ Chart.js を CDN から読込)。アクセス解析は Google Analytics (GA4) を使用。

制作にあたっては「デジタル民主主義2030」プロジェクト( https://dd2030.org/ )の取り組みを参考にしました。ただし本サイトは同プロジェクトから支援・公認を受けているものではなく、一切関係のない有志による非公式サイトです。

## 仕組み

```
data/members.json   … 議員マスタ(手動管理): 氏名・会派・プロフィール・媒体URL・RSSフィード・手動確認欄
data/posts.json     … 発信履歴(自動生成): scripts/update_posts.py が毎日更新
data/questions.json … 一般質問の登壇記録(自動生成): scripts/update_questions.py が毎日更新
scripts/update_posts.py       … RSS巡回スクリプト(Python)
scripts/update_questions.py   … 議会映像配信サイトから一般質問履歴を取得(1秒間隔の低負荷アクセス)
scripts/backfill_posts.py     … 過去投稿の遡取スクリプト(WordPress系フィードの ?paged=N を巡回)
.github/workflows/update.yml  … 日次実行ワークフロー
```

**過去データの遡取**: 通常のRSSは直近10件程度しか配信しないため、長期表示用の過去分は `python scripts/backfill_posts.py` で一度だけ取り込みます(2020年2月=前任期開始まで)。日次更新は既存履歴を保持したまま新着を積むので、再実行が必要なのは新しいフィードを追加したときだけです。

- RSSフィードから取得した投稿を記事URLで重複排除しながら `posts.json` に蓄積します(RSSは直近分しか配信されないため、履歴は運用開始後に積み上がります)。
- フィード取得に失敗しても処理は継続し、`posts.json` の `errors` に記録されます。

## セットアップ(GitHub Pages 公開手順)

1. GitHub にリポジトリを作成し、このディレクトリ一式を push する
2. リポジトリの **Settings → Pages** で
   - Source: **Deploy from a branch**
   - Branch: **main** / **(root)** を選択
3. **Settings → Actions → General → Workflow permissions** で **Read and write permissions** を有効化(ワークフローが `posts.json` をコミットするため)
4. **Actions** タブから `Update posts data` を **Run workflow** で手動実行し、`data/posts.json` が更新されることを確認
5. 以後は毎日 JST 6:00 に自動実行され、変更があれば自動コミット → Pages が再デプロイされます

## ローカルでの確認

```sh
# データ更新スクリプトの実行
pip install -r requirements.txt
python scripts/update_posts.py

# サイトの表示確認(fetch を使うため file:// では動きません)
python -m http.server 8000
# → http://localhost:8000 を開く
```

## データの更新方法

### 議員・媒体情報の更新(members.json)

各議員は次の構造です:

```json
{
  "id": "yoshida-ryo",
  "name": "吉田 良",
  "kana": "よしだ りょう",
  "faction": "名和会",
  "links": {
    "website": "https://ryo-yoshida.com/",
    "blog": null, "x": "https://x.com/ryoyoshida1771",
    "youtube": null, "facebook": null, "instagram": null
  },
  "feeds": [
    { "platform": "website", "url": "https://ryo-yoshida.com/feed/" }
  ],
  "manual": [
    { "platform": "x", "lastPostDate": null, "checkedDate": null, "note": "" }
  ]
}
```

- **links**: 媒体があればURL、なければ `null`。一覧のアイコン表示に使われます(`tiktok` など追加キーも可)
- **feeds**: RSS/Atomで自動取得する対象。ブログ等を見つけたらここに追加
  - RSS URLの例 — Ameba: `https://ameblo.jp/xxx/rss.html` / WordPress: `https://example.com/feed/` / はてな: `https://xxx.hatenablog.com/rss` / YouTube: `https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxx`
  - 追加前にブラウザ等でURLが開けること(XMLが返ること)を確認してください
- **manual**: RSS非対応媒体(X・Instagram・Facebook等)の**手動確認欄**。媒体を実際に見て、
  - `lastPostDate`: 最後の発信日(`"2026-06-20"` 形式)
  - `checkedDate`: 確認した日
  を記録できます(確認履歴の管理用。現在はページ表示には使用していませんが、将来の機能追加に備えて構造を維持しています)

### 発信履歴(posts.json)

自動生成ファイルのため直接編集しないでください。手動実行したい場合は Actions の `Update posts data` → Run workflow を使うか、ローカルで `python scripts/update_posts.py` を実行してコミットします。

## 掲載基準・免責

- 掲載する媒体は、プロフィール等に「名取市議会議員」等の記載があり本人のものと確認できたもののみです。同姓同名の別人アカウントを誤って掲載しないよう、不確かなものは掲載していません
- 「月別発信回数」はRSSフィードから自動取得できた投稿(ブログ・公式サイト等)のみの集計です。X・Instagram・Facebook等はRSS取得に対応していないため、SNSへの投稿は発信していても集計に含まれません
- 本サイトは特定の議員・会派を支持または批判するものではありません。掲載内容の誤り・媒体の追加依頼は Issue でお知らせください

## 出典

- [名取市議会議員名簿(名取市公式)](https://www.city.natori.miyagi.jp/site/gikai/3533.html)
- [会派別名簿(名取市公式)](https://www.city.natori.miyagi.jp/page/3555.html)
- 各議員の公開媒体(公式サイト・ブログ・SNS)
