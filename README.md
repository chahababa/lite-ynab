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
- 每月 1 號自動產生上月支出月報，存入 Notion、透過 Telegram 摘要通知，並可同步到 Google Sheets

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
- 預算結轉：沒花完的預算自動累積到下個月（2026-07 起算）
- 收入自動帶入：新月份自動複製最近一次填寫的收入
- 月報自動分析與通知（Notion 存檔 + Telegram 摘要 + Google Sheets 匯出）
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
202604110001_merge_duplicate_english_categories.sql
202605180001_monthly_auto_budget_reset.sql
202605180002_add_transaction_source_fields.sql
202605210001_merge_duplicate_rent_category_helpers.sql
202605210002_fix_duplicate_rent_category_helper_array_concat.sql
202605210003_fix_duplicate_rent_helper_conflict_target.sql
202605210004_fix_duplicate_rent_preview_notes_array.sql
202607030001_month_init_income_carry_no_backfill.sql
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
- Google Sheets 匯出準備用 query：
  - `includeReport=1`：在授權後 response 中附上完整 monthly report JSON
  - `dryRun=1`：只產生 report，不送 Telegram、不寫 Notion，避免重跑同步時造成副作用
- 建議排程：每月 1 號 00:10（Asia/Taipei）
- 輸出：上月總支出、總預算、剩餘 / 超支、交易筆數、大項 / 小項佔比、Top 5 支出、超支提醒、80% 預算使用提醒
- 通知：先傳 Telegram 摘要，再寫入 Notion「LiteYNAB 月報資料庫」

## Google Sheets 月報匯出

受保護 endpoint：`GET/POST /api/cron/monthly-expense-report/sheets`

- Header：`Authorization: Bearer ***`
- Optional query：`?monthId=YYYY-MM`（不帶時會以 Asia/Taipei 計算「上個月」）
- Optional query：
  - `dryRun=1`：只產生 Google Sheets 預覽資料，不寫入 Sheet
  - `includeTables=1`：搭配 `dryRun=1` 時，在 response 中附上即將寫入的表格 rows
- 寫入策略：
  - `Monthly Summary` / `Category Breakdown` / `Transactions` 會保留其他月份資料，替換同一個 `monthId` 的舊 rows，避免重跑造成重複
  - `Export Log` 每次同步 append 一列紀錄
- 需要 Zeabur env：
  - `GOOGLE_SHEET_ID`
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- 目前正式 Sheet：`Lite YNAB 月報匯出`（`1bnq9psR6yWNvZv97n1t5zyZkqTf2PMNH8tLwnfoZm28`）
- 服務帳號需要被加入該 Google Sheet，且至少要有 Editor 權限

## 每日交易 Google Sheets 備份

`GET/POST /api/cron/daily-transaction-backup` 以 `Authorization: Bearer <CRON_SECRET>` 保護，固定讀取 `LITEYNAB_USER_ID` 的交易與分類名稱。缺少 tenant 時，包含 dry run 都會在讀取資料前拒絕。

- 使用獨立的 `GOOGLE_TRANSACTION_BACKUP_SHEET_ID`，不得指向月報 Sheet。
- `Transactions Current` 保存最新交易快照；`Transaction History` 首次記錄 `BACKFILL`，之後追加 `INSERT`、`UPDATE`、`DELETE`（刪除前快照）。不輸出頂層 `user_id`。
- `dryRun=1`（或 `true`）會讀取來源與 Sheet，但只回傳筆數、差異計數與 row hashes，不寫入、不回傳原始交易內容。
- 先寫 History，再覆寫 Current，最後清除舊尾列。序列重試以 History 還原基準，不會因 Current 寫入失敗而重複 BACKFILL/INSERT；event ID 包含前一事件，保留反覆修改及刪除後重建的差異。
- 備份 transport 使用 `RAW` 與 `UNFORMATTED_VALUE`，讓公式外觀文字、前導零及日期外觀文字保持原值，金額維持數字。月報 transport 的既有預設不在本 PR 變更範圍內。
- v1 只允許一個 scheduler，每日一次、max concurrency = 1、序列 retry。端點的 process-local single-flight 在同一 instance 重疊時回 `409`；這不是跨 instance distributed lock，也不提供 HA 保證。

每日快照只捕捉兩次備份之間的淨變化；同日新增後刪除且未跨過備份點的交易不會留存。來源分頁並非資料庫 point-in-time snapshot：筆數漂移或重複 ID 會拒絕執行，但分頁期間同筆數的異動不保證偵測。交易與分類分開讀取，執行中改名可能於下次備份才反映。v1 不新增 DB audit trigger、migration 或 Sheet 回寫。

正式啟用前，依 [部署與恢復說明](./DEPLOYMENT.md#每日交易備份啟用與恢復) 完成獨立 activation gate。程式碼合併不等於排程啟用，也不授權首次 production backfill。

## 報表頁目前支援

- 月對月比較
- 日期區間統計
- 大項支出環圈圖，附金額與占比
- 截至所選月份的六個月支出趨勢長條圖
- 與前月全月比較，包含差額、百分比與細項比較；本月未結束時另有提示
- 桌機自動展開為寬版多欄，手機自動堆疊，不需開啟桌機模式
- 報表只讀取資料，不初始化歷史月份；所有資料表分頁讀取，無紀錄月份顯示 0
- 預算 vs 實際支出
- 大項展開看小項明細
- 支付方式分析
- CSV / Excel 匯出

## 文件

- 開發規則：[AGENTS.md](./AGENTS.md)
- 使用說明：[USER_GUIDE.md](./USER_GUIDE.md)
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
- 設定 Google Sheets service account env、部署後建立正式同步 cron
- 設定自訂網域（選用）
