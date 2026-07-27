# menu-prompt-generator

毎日の食事予定、済／未、使い切り食材、今週の候補、願望、回避情報を入力し、AI相談用テキストを生成するPWAです。

## 主な機能

- 日付ごとの下書き保存
- 朝・昼・夕・間食の済／未管理
- 今日中・近日中・今週の候補・願望・回避欄
- 登録済み項目、いつものメニュー、常備在庫表の編集
- 翌日への自動引き継ぎ（今日中は除外）
- AI相談文生成・コピー
- 確定メニュー履歴と昨日の食事表示
- 全体／月別JSONバックアップ
- PWA・オフライン対応

## GitHub Pages

Repository Settings → Pages → Build and deployment で、`Deploy from a branch`、`main`、`/(root)` を選択します。

公開URL：`https://whiteringogm.github.io/menu-prompt-generator/`

## 保存キー

旧ツールと分離したlocalStorageキーを使用します。

- `menuPromptGenerator.v5.history`
- `menuPromptGenerator.v5.usuals`
- `menuPromptGenerator.v5.drafts`
- `menuPromptGenerator.v5.settings`
- `menuPromptGenerator.v5.pantry`
