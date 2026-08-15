# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Codeの応答ルール

- **思考中の解説を含め、日本語で応答すること。**
- **プランモードでプランを提示する際は、実行時にどのモデルを使うかを提案とともに尋ねること**(トークン消費を抑えるため、実行フェーズだけ軽量モデルに切り替える等の検討をユーザーができるようにする)。
- **チャット返信内のURLはmarkdownリンク形式で、前後に句読点や括弧を密着させないこと**。例：❌「[URL](https://example.com/)で」のように句読点を直後に続ける → ✓「[URL](https://example.com/) で」のように空白を置く。理由：素のURLに隣接する文字がリンク判定に巻き込まれ、クリックしても開けなくなる。

## プロジェクト概要

これは**静的HTML/CSS/JSサイト**(ビルド不要・フレームワークなし)で、名取市議会の姿(議員の活動・議員定数・議員報酬・市議選投票率)を可視化します。サイト名は「名取市議会 見える化」。RSSフィード・議会映像配信サイト・政府統計などの公開情報を集約し、インタラクティブな表・グラフとして表示します。

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

## データアーキテクチャ

データフロー・各JSONファイル(members.json / posts.json / questions.json / council.json / salary.json / turnout_elections.json / turnout.json)の構造と注記は、スキル **data-schemas**(`.claude/skills/data-schemas/SKILL.md`)に集約。データ関連の作業時に参照すること。

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

新しいJSを書く前に、`common.js` に既存のヘルパー(`fetchJson` / `loadData` / `parseDate` / `daysAgo` / `formatDateJa` / `calcAge` / `freshnessClass` / `formatVotesHtml` / `formatShareHtml` / `regressionLine` / `monthKey` 系 等)がないか確認する。関数の署名・詳細は `js/common.js` を直接参照。

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
- **スクリプトのキャッシュ破損:** `work/` ディレクトリは一時的なもの(`.gitignore` 対象済み)。コミットに含めないこと。永続データはすべて `data/` に置く
- **ローカルテストの省略:** `python -m http.server 8000` を使うこと。file:// URLでは `fetch()` が動かない
