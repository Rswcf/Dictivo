# Dictivo

[English](../README.md) | [简体中文](README.zh-CN.md) | 日本語 | [Español](README.es.md)

> ⚠️ この日本語翻訳は英語 README の短縮版です。完全な機能説明は [English README](../README.md) を参照してください。翻訳 PR を歓迎します。

Dictivo は macOS から提供するローカルファーストな音声入力アプリです。既定の Local モードはデバイス上の `whisper.cpp` エンジンで文字起こしを行います。低レイテンシが必要で、現在の録音をクラウド転写プロバイダーへ送信してもよい場面では、任意で Cloud Fast を選べます。Windows のパッケージング経路はリポジトリ内にありますが、公開リリースは macOS が安定してからの予定です。

## Dictivo が向いていること

| ニーズ | Dictivo の考え方 |
| --- | --- |
| すばやく入力したい | グローバルホットキーで録音を開始、停止し、結果を現在のアプリへ貼り付けます。 |
| 作業内容を手元に残したい | 音声、文字起こし、辞書、スニペット、履歴はローカルに保存されます。 |
| そのまま貼り付けられる形に整えたい | 既定では通常の Message として出力し、`Settings -> Engine -> Text cleanup` で句読点、フィラー削除、大文字化を調整できます。 |
| 固有名詞を安定させたい | ローカル辞書と snippets で名前、製品名、リンク、定型文を管理できます。 |
| PC 性能に合わせたい | Fast、Medium、Quality のローカルエンジン設定を選べます。 |

## クイックスタート

リリース成果物が公開されたら、GitHub Releases から最新ビルドをダウンロードしてください。

- macOS: `.dmg`

Dictivo を開き、`Settings -> Engine` でローカルモデルをダウンロードまたはインポートします。

ソースから実行する場合:

```bash
npm install
npm run tauri:dev -w @dictivo/desktop
```

ブラウザーだけでフロントエンドを確認する場合:

```bash
npm run dev
```

## 最初の音声入力

1. `Settings -> Engine` を開きます。
2. `.bin` モデルをダウンロードまたはインポートします。
3. OS の案内に従ってマイクとアクセシビリティ権限を許可します。
4. `CommandOrControl+Shift+Space` で録音を開始します。
5. 普段どおりに話します。
6. 同じホットキーをもう一度押して停止します。
7. 既定の Local モードではローカルで文字起こしし、最終テキストをコピーして現在のアプリへ貼り付けを試みます。Cloud Fast に切り替えた場合は、停止後に今回の音声だけを Dictivo proxy へアップロードして高速に文字起こしします。

OS によって自動貼り付けがブロックされた場合でも、テキストはクリップボードにコピーされています。macOS では `Command+V` を押してください。

## トラブルシューティング

| 問題 | 確認すること |
| --- | --- |
| 録音できない | マイク権限を確認し、Dictivo を再起動します。 |
| ローカルモデルが見つからない | `Settings -> Engine` で `.bin` モデルをダウンロードまたはインポートします。 |
| コピーされるが貼り付けられない | macOS のアクセシビリティ権限を確認し、貼り付け先の入力欄にフォーカスしてから `Command+V` を押します。 |
| グローバルホットキーが反応しない | 他のアプリと競合している場合は `Settings -> Hotkeys` で変更します。 |
| 最初の文字起こしが遅い | まず小さいモデルで設定を確認し、その後に高品質モデルへ切り替えます。 |

## ローカルエンジン

パッケージ済みデスクトップビルドには、想定される Private Fast エンジン構成が含まれます。ソースから実行する場合は、小さいモデルで権限、ホットキー、レイテンシを先に確認してください。

```bash
DICTIVO_MODEL=small scripts/setup-private-fast.sh
```

高品質を優先する場合:

```bash
DICTIVO_MODEL=large-v3-turbo-q5_0 scripts/setup-private-fast.sh
```

任意の上書き設定:

```bash
DICTIVO_PRIVATE_FAST_HOME=/path/to/private-fast
DICTIVO_WHISPER_CLI=/path/to/whisper-cli
DICTIVO_WHISPER_MODEL=/path/to/model.bin
```

## プライバシーモデル

Dictivo はローカルファースト設計です。Local モードは音声入力のためにクラウド AI API を呼び出しません。Cloud Fast は別の任意モードで、現在の録音だけを Dictivo-owned backend/proxy にアップロードし、サブスクリプション確認、月間分数の計測、主経路とバックアップ経路をサーバー側で処理します。ユーザーに provider picker は表示しません。

バックエンドが受け取ったり保存したりしてはいけないもの:

- 音声データまたは音声 URL
- 文字起こしテキスト
- 会議要約
- 辞書の用語
- snippets
- provider 認証情報
- API keys

Cloud Fast 以外のメタデータ API は、ローカル session ID、provider 名、プライバシーモード、長さ、単語数などの非コンテンツ情報だけを扱います。辞書と snippets は Cloud Fast でもデスクトップ側に残り、戻ってきた transcript にローカルで適用されます。

## 言語の扱い

現在のアプリは入力言語を自動検出し、出力は話した言語のまま保持します。事前に "Speaking in" を選ぶ必要はありません。主な対象:

- English
- 中文
- Español
- 日本語
- Français
- Deutsch
- Tiếng Việt

GitHub ドキュメントは English、简体中文、日本語、Español を提供しています。追加翻訳の pull request を歓迎します。

## ショートカット

| ショートカット | 操作 |
| --- | --- |
| `CommandOrControl+Shift+Space` | 音声入力の開始または停止 |
| `CommandOrControl+Shift+V` | 最後の文字起こしを貼り付け |

ショートカットは `Settings -> Hotkeys` で変更できます。

## 開発コマンド

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run e2e
npm run test:coverage
npm run build
```

ネイティブデスクトップ:

```bash
npm run tauri:dev -w @dictivo/desktop
npm run tauri:build -w @dictivo/desktop
```

## ロードマップ

- 署名済み macOS リリースを公開する。
- README に製品スクリーンショットと短いデモ動画を追加する。
- マイク権限、グローバルホットキー、ローカルモデル実行のネイティブ E2E を拡張する。
- macOS リリースが安定した後に Windows パッケージングを進める。
- コミュニティ翻訳を増やす。

## コミュニティ

- 質問とセットアップ: リポジトリ公開後は GitHub Discussions を使います。
- バグ: OS、アプリバージョン、ローカルモデル、再現手順を GitHub Issues に記載してください。
- セキュリティやプライバシー: 機密ログを公開せず、設定後のセキュリティ連絡先を使ってください。
- 翻訳: 該当する `docs/README.<locale>.md` を更新する pull request を送ってください。
