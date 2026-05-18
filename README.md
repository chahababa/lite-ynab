# Lite YNAB

使用 `Next.js + Supabase` 製作的輕量化記帳與預算規劃系統。

正式網址：https://lite-ynab.zeabur.app/

目前專案已進入可實際操作的 beta 階段，並已部署上線。主流程包含：
- 日常記帳
- 快速記帳
- 月初預算分配
- 預算使用儀表板
- 完整交易查詢
- 報表分析
- 每月 1 號自動產生上月支出月報，存入 Notion 並透過 Telegram 摘要通知

## 目前功能

- 登入 / 註冊
- 主控臺 Dashboard
- 快速記帳頁
- 預算分配中心
- 預算使用儀表板
- 全部交易頁
- 報表頁
- 大項 / 小項分類管理
- 支付方式管理
- 固定預算設定
- 月報自動分析與通知（Notion 存檔 + Telegram 摘要）
- 基本測試與型別檢查

## UI 設計風格

- **v2.0+ (2026-05)**：Material 3 淺色明亮（Material You），所有金額走 `MoneyText` 元件（mono + tabular-nums + 千分位 + 語意化顏色），分類用 M3 cat palette + lucide icon。設計規範見 `design/DESIGN-SPEC.md`，hi-fi 設計稿在 `design/material3/`。
- v1.0 的 Winamp 金屬鍍鉻擬物化已於 v2.1 完整淘汰（所有 chrome / neu / ink-paper-sun-mint legacy tokens 已從 tailwind.config.ts 移除，globals.css 也清掉 chrome custom CSS）。

## 技衃棧

- `Next.js 15`
- `React 19`
- `TypeScript`
- `Tailwind CSS`
- `Supabase Auth + Postgres`
- `Vitest + Testing Library`
- 部署平台：`Zeabur`（Docker 容器，node:20-alpine）

## 主要頁面

- `/login`
  - 登入 / 註冊
- `/`
  - 主控臺，日常查看與記帳主頁
- `/quick-entry`
  - 快速記帳控制台（v1.0 重做：1 屏密集 + 9 格常用分類 grid 為主視覺，比舊版少 1 個 scroll 步驟）
- `/budget-allocation`
  - 正式版預算分配頁，採表格式分配介面
- `/budget-usage`
  - 預算使用儀表板，查看已支出 / 剩餘 / 超支情況
- `/transactions`
  - 全部交易查詢、編修、篩選
- `/reports`
  - 報表分析
- `/settings`
  - 補充設定頁

## 本機啟動

1. 安裝套件

```powershell
npm install
```

2. 建立 `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

3. 依序套用 Supabase migrations

```text
202604020001_init_lite_ynab.sql
202604030001_fix_default_category_labels.sql
202604030002_fix_auth_function_user_id.sql
202604030003_translate_default_categories_to_zh_hant.sql
202604030004_add_budget_planning_groups_and_payment_methods.sql
202604030005_stop_recreating_deleted_default_categories.sql
```

4. 啟動開發伺服器

```powershell
npm run dev
```

5. 驗證

```powershell
npm run typecheck
npm run test
```

## 資料表與 RPC

主要資料表：

- `category_groups`
- `categories`
- `payment_methods`
- `monthly_incomes`
- `budgets`
- `transactions`

主要 RPC：

- `bootstrap_default_category_groups()`
- `bootstrap_default_categories()`
- `bootstrap_default_payment_methods()`
- `initialize_monthly_budget(text)`
- `reset_monthly_auto_budgets(text)`

## 月報自動分析

受保護 endpoint：`GET/POST /api/cron/monthly-expense-report`

- Header：`Authorization: Bearer <CRON_SECRET>`
- Optional query：`?monthId=YYYY-MM`（不帶時會以 Asia/Taipei 計算「上個月」）
- 建議排程：每月 1 號 00:10（Asia/Taipei）
- 輸出：上月總支出、總預算、剩餘 / 超支、交易筆數、大項 / 小項佔比、Top 5 支出、超支提醒、80% 預算使用提醒
- 通知：先傳 Telegram 摘要，再寫入 Notion「LiteYNAB 月報資料庫」

## 報表頁目前支援

- 月對月比較
- 日期區間統計
- 細項分類圓餅圖
- 趨勢長條圖
- 預算 vs 實際支出
- 大項展開看小項明細
- 支付方式分析
- CSV / Excel 匯出

## 文件

- 開發規則：[AGENTS.md](./AGENTS.md)
- 設計規格：[design/DESIGN-SPEC.md](./design/DESIGN-SPEC.md)
- 版本變更：[CHANGELOG.md](./CHANGELOG.md)
- 專案現況：[STATUS.md](./STATUS.md)
- 部署流程：[DEPLOYMENT.md](./DEPLOYMENT.md)

## 開發注意事項

- 開著 `npm run dev` 時，不建議同時跑 `npm run build`
  - 在 Windows 環境容易因為 `.next` 被重寫h��讓樣式或頁面暫時異常
- 平常開發優先使用：
  - `npm run typecheck`
  - `npm run test`
- 純數字輸入框一律置中
- 文字輸入框的文字不要貼齊左框
- 大項分類標籤必須有固定且可辨識的顏色區隔

## 下一步建議

- 建立測試帳號，驗證登入後完敵功能
- 繽續補強報表頁互動
- 同步 `package-lock.json` 後將 Dockerfile 改回 `npm ci`
- 規劃 Google Sheets 同步
- 設定自訂網域（選用）
