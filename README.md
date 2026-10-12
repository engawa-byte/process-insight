# Process Insight | CSV業務分析ダッシュボード

架空の業務データをアップロードして担当者別の処理件数・作業時間・平均処理時間を可視化する、**ポートフォリオ用デモアプリ**です。実際の企業への納品・稼働実績を表すものではありません。

## デモで確認できること

- UTF-8 CSVアップロード（ファイル選択 / ドラッグ＆ドロップ）
- ヘッダー、日付、非負整数の処理件数、非負数の時間を検証。エラーがあるCSVは部分反映せず却下
- KPI（総処理件数、総作業時間、1件当たり平均処理時間、データ行数）
- 日別の処理件数・平均処理時間を切り替えて表示する折れ線グラフ（担当者フィルターと連動）
- 担当者別の処理件数・平均処理時間を切り替えて表示する横棒グラフ（選択指標の上位30名）・全担当者の集計テーブル
- 開始日・終了日（両端を含む）と担当者による絞り込み
- 絞り込みに追随する集計結果CSVのダウンロード（UTF-8 BOM付き）
- Material Design 3を踏まえた、画面幅に合わせた業務分析レイアウト
- CDN接続不能時のCSVパースとグラフの簡易代替表示

## 起動方法（Mac）

macOSのターミナルで展開先の `process-insight` に移動して、以下を実行:

```bash
cd ~/Downloads/process-insight
python3 -m http.server 8000
```

ブラウザで http://localhost:8000 にアクセスすると、`data/sample.csv` が自動的に読み込まれます。

終了時はターミナルで `Control + C`。

> `index.html` をダブルクリックして `file://` で開くと、ブラウザによってはサンプルCSVの取得が制限されます。HTTPサーバーで起動してください。

## 入力CSVの仕様

```csv
日付,担当者,処理件数,作業時間（分）
2026-10-01,田中,18,63
2026-10-01,佐藤,14,49
```

- 必須列は `日付`, `担当者`, `処理件数`, `作業時間（分）` （順不同、追加列は無視）
- 日付は `YYYY-MM-DD` の実在日付
- 件数は0以上の整数、作業時間は0以上の数値
- UTF-8（BOMの有無を問わない）、最大5MB、最大20,000データ行
- 文字コードShift_JISは対象外。必要ならExcelで「CSV UTF-8」を選択
- 不正なデータが1行でもあれば読込全体を却下。修正前の画面結果を保持
- **平均処理時間 =（該当行の総作業時間）÷（該当行の総処理件数）**。件数0の場合は「—」

## 技術と制作範囲

- HTML5 / CSS3 / Vanilla JavaScript
- Chart.js 4.5.1（折れ線・棒グラフ） / Papa Parse 5.7.0（CSV解析）
- GitHub Pagesで動く静的サイト。バックエンド、DB、ビルド、APIキーは不要
- ライブラリはバージョン固定のjsDelivr CDNを使用。利用ライセンスはいずれもMIT。CDNに接続できない場合も、同梱の自作フォールバックで基本操作可
- **独自実装:** 画面レイアウト、CSV入力チェック、集計ロジック、フィルター、CSV出力、レスポンシブUI、CDNフォールバック
- **第三者実装:** Chart.js、Papa Parse
- フォント、イラスト、画像の第三者素材は不使用
- CSVはブラウザ上で読み取り・集計。アプリ自体にはCSVをサーバー送信する処理がありません。ただし外部ライブラリの取得にはインターネット接続が必要な場合があります。

## プロジェクト構成

```text
process-insight/
├── index.html
├── styles.css
├── analytics.js
├── app.js
├── data/
│   └── sample.csv
├── tests/
│   └── analytics.test.cjs
└── README.md
```

## テスト

Node.jsがあれば以下のコマンドで集計ロジックのテストが実行できます。

```bash
node tests/analytics.test.cjs
node tests/daily.test.cjs
node tests/filters.test.cjs
```

ブラウザでは、サンプル自動読み込み → KPI・日別推移・棒グラフ表示 → 指標切替と期間・担当者フィルター → CSVエクスポートを確認してください。ゼロ件、負数、日付エラー、列不足のCSVでも検証してください。

## GitHub Pages 公開手順

1. GitHubでPublicリポジトリ `process-insight` を作成（README自動生成はオフでも可）。
2. このフォルダ内からGitを初期化してファイルをコミットし、GitHubにpushします。

   ```bash
   git init
   git add .
   git commit -m "Build Process Insight MVP"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/process-insight.git
   git push -u origin main
   ```

3. GitHubリポジトリ → **Settings → Pages** → **Build and deployment** で **Deploy from a branch**、`main` / `/(root)`、Saveを選択。
4. 発行される `https://YOUR_USERNAME.github.io/process-insight/` にアクセスしてサンプル読み込みとCSV出力を検証。

> このリポジトリには架空データのみを含めてください。会社で利用したデータ、内部資料、コードを転用しないでください。

## 改善候補（MVPの外）

- 日付範囲フィルターと月次推移
- データ異常値や担当者ごとの作業負荷の検出
- 性能評価や業務改善につなげる指標の追加
- テスト範囲の拡充（ブラウザ自動テスト、アクセシビリティ検証）

## 作者

個人による学習・ポートフォリオ制作。実在企業の承認や業務関与を示すものではありません。
