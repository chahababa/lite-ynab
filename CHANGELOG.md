# CHANGELOG

## [Unreleased] - Google Sheets 月報匯出

### Added

- 新增 `src/lib/googleSheetsMonthlyExport.ts`，可把 monthly report 轉成 Google Sheets tabs：`Monthly Summary`、`Category Breakdown`、`Transactions`、`Export Log`。
- 新增受保護 endpoint：`GET/POST /api/cron/monthly-expense-report/sheets`，會產生指定月份月報並同步到 Google Sheet。
- Google Sheets 同步會保留其他月份資料，替換同一 `monthId` 的舊 rows，避免重跑同月份 cron 造成重複；`Export Log` 會 append 同步紀錄。
- `/api/cron/monthly-expense-report/sheets` 支援 `dryRun=1&includeTables=1`，可預覽即將寫入的表格 rows，不寫入 Sheet。
- `/api/cron/monthly-expense-report` 新增授權後的 `includeReport=1` 選項，可在 response 中回傳完整 monthly report JSON，供 Google Sheets 匯出流程使用。
- `/api/cron/monthly-expense-report` 新增 `dryRun=1` 選項，可只產生 report，不送 Telegram、不寫 Notion，避免同步 Google Sheets 時造成重複副作用。
- 新增 monthly expense report route 與 Google Sheets export helper 測試，覆蓋預設 side-effect 行為、dry-run preview、同月份 rows replacement、Google Sheets rows mapping。

### Documentation

- 更新 `USER_GUIDE.md`，用白話補上 Google Sheets 月報匯出的用途、四個分頁、手動補跑、dry-run 預覽、重跑同月覆蓋策略與 service account 權限注意事項。
- 更新 `README.md` 文件清單，加入使用說明入口。

### Deployment notes

- 新增 env：`GOOGLE_SHEET_ID`、`GOOGLE_SERVICE_ACCOUNT_EMAIL`、`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`。
- Google service account 需被加入 `Lite YNAB 月報匯出` Google Sheet，至少要有 Editor 權限。
- Endpoint 仍需 `Authorization: Bearer *** token>`；完整 report JSON 與 Google Sheets rows 視為敏感資料，不應寫入公開 logs。
- 建議正式同步 cron：每月 1 號 00:20（Asia/Taipei），排在 Notion/Telegram 月報之後。

### Verified

- `npm run test -- src/lib/googleSheetsMonthlyExport.test.ts`
- `npm run test -- src/app/api/cron/monthly-expense-report/sheets/route.test.ts src/lib/googleSheetsMonthlyExport.test.ts`
- `npm run typecheck`
- `npm run test`（25 files / 99 tests）
- `git diff --check`

## [v3.2] - 2026-05-19 — Hermes 文字記帳入口

### Added

- 新增 `src/lib/hermesTransaction.ts`：解析 Hermes/Telegram 文字記帳內容，支援金額、今天/昨天/ISO 日期、分類名稱、支付方式名稱與 note 萃取。
- 新增受保護 endpoint：`POST /api/hermes/transactions`
  - Header：`Authorization: Bearer <HERMES_WEBHOOK_SECRET>`
  - 寫入 `transactions.source = 'hermes'`
  - `source_text` 保存原始訊息，`source_id` 支援 Telegram/Hermes 訊息 dedupe
  - `metadata.hermes` 保存 parser version、confidence、warnings、matched category/payment method 與 context
- 新增 route/helper 單元測試，覆蓋授權、解析、寫入 payload 與 duplicate source id。

### Deployment notes

- 新增 Zeabur env：`HERMES_WEBHOOK_SECRET`。
- 建議設定 `LITEYNAB_USER_ID`，讓 Hermes webhook 固定寫入單一 Lite YNAB 使用者；若未設定，request body 必須提供 `userId`。
- 正式 DB 已修復 Supabase migration history；`supabase db push --dry-run` 顯示 remote database up to date。

### Verified

- `npm run test -- src/lib/hermesTransaction.test.ts src/app/api/hermes/transactions/route.test.ts`
- `npm run typecheck`
- `npm run test`（22 files / 85 tests）
- `npm run build`
- `git diff --check`

## [v3.1] - 2026-05-18 — 月報自動分析 + Notion/Telegram 通知

### Added

- 新增純 helper `src/lib/monthlyExpenseReport.ts` 與單元測試，彙整上月總支出、總預算、剩餘 / 超支、交易筆數、大項 / 小項支出佔比、Top 5 支出、超支與 80% 預算使用提醒。
- 新增 server-side 月報資料讀取 `src/lib/monthlyExpenseReportServer.ts`，使用 `SUPABASE_SERVICE_ROLE_KEY` 供排程讀取上月資料；可選用 `LITEYNAB_USER_ID` 限定單一使用者。
- 新增 Notion 存檔 helper `src/lib/notionMonthlyReports.ts`，寫入「LiteYNAB 月報資料庫」。
- 新增 Telegram 通知 helper `src/lib/telegramNotify.ts`，傳送月報文字摘要。
- 新增受保護排程 endpoint：`GET/POST /api/cron/monthly-expense-report`
  - Header：`Authorization: Bearer ***`
  - Optional query：`?monthId=YYYY-MM`
  - 不帶 `monthId` 時，以 Asia/Taipei 計算「上個月」

### Fixed

- 修正 production cron endpoint 呼叫 `src/lib/data.ts` client module export 導致 500 的問題；將報表純計算 helper 拆到 `src/lib/reportData.ts`，供 client/server 共用。

### Deployment notes

- 月報正式排程：每月 1 號 00:10（Asia/Taipei），避開 v3.0 00:01 固定預算自動回復 cron。
- 需要 Zeabur env：`SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET`、`NOTION_API_KEY`、`NOTION_MONTHLY_REPORT_DATABASE_ID`、`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`。
- `TELEGRAM_CHAT_ID` 需由 Matt 先對 bot 傳訊息後，再用 Telegram `getUpdates` 取得；不要把 bot token 或 chat id 寫入 repo / Notion。

### Verified

- `npm run typecheck`
- `npm run test`（20 files / 75 tests）
- `npm run build`
- `git diff --check`

## [v3.0] - 2026-05-18 — 月初固定預算自動回復 + 學習提醒

### Added

- 新增 Supabase migration `202605180001_monthly_auto_budget_reset.sql`
  - `reset_monthly_auto_budgets(month_id)` RPC：可由排程在每月 1 號把啟用固定預算的小項，強制回寫成該小項的 `auto_amount`
  - `budget_auto_adjustment_stats`：記錄固定預算小項在單月被手動調整的次數、最近調整金額與固定金額
  - `record_budget_auto_manual_adjustment` trigger：使用者手動改動本月預算且偏離固定預算時，自動累加調整次數；系統月初重設不會被計入
- 新增受保護排程 endpoint：`GET/POST /api/cron/monthly-budget-reset`
  - Header：`Authorization: Bearer <CRON_SECRET>`
  - Optional query：`?monthId=YYYY-MM`
  - 需要環境變數：`CRON_SECRET`、`SUPABASE_SERVICE_ROLE_KEY`
- 預算分配頁在固定預算小項被手動改成不同金額時，會提示「系統會記錄這次手動調整；如果常常調整，建議更新固定預算」。

### Verified

- `npm run typecheck`
- `npm run test`（19 files / 72 tests）
- `npm run build`
- `git diff --check`
- `supabase db lint --local` 嘗試執行但本機 Supabase DB 未啟動（127.0.0.1:54322 refused），SQL migration 尚需在 Supabase 環境套用時再驗證。

## [v2.1.1] - 2026-05-08 — Hotfix：刪支付方式錯誤訊息 + 同名分類分群顯示

PR #6（merge commit `2c86783`）。三個小 bug 一起：

### Fixed — `/budget-allocation` 刪支付方式錯誤訊息被吞

- **問題**：當支付方式仍有歷史交易時，DB 因 `on delete restrict` 拒絕，但 Supabase `PostgrestError` 不是 `Error` instance，被 `getErrorMessage` 走 fallback 顯示「發生未預期的錯誤」，使用者看不到真正原因
- **修法**：
  - `getErrorMessage` 加 PostgrestError 處理（讀 `.message` / `.code` / `.hint`）
  - `deletePaymentMethod` 改成先用 `count(*)` 跨月份查還有幾筆交易，給出具體訊息「還有 N 筆交易（含過去月份），請先到 /transactions 跨月份刪除或改成其他支付方式後再刪」
- 這同時解決了 user 困惑「`/transactions` 看不到交易但還是刪不掉」的問題（`/transactions` 只看當月，YNAB 匯入的歷史月份交易看不見）

### Fixed — 同名分類在所有列表都加群組前綴

- **問題**：lite-ynab 大項分類允許同名小項（例：「個人/飲食」+「家庭/飲食」），但 `/quick-entry` 1×6 grid、`/budget-usage` 列表、`/reports` 細項、Dashboard 分類預算 grid、Dashboard 最近交易、`/transactions` 列表，都只顯示 `category.name` 看不出是哪個
- **修法**：
  - 新增 `src/lib/categoryDisplay.ts` 工具：`getAmbiguousCategoryNames()` 偵測同名 + `getCategoryDisplay()` 計算顯示文字
  - **只在偵測到同名衝突時** 才顯示群組前綴；不衝突的維持原本乾淨樣式
  - 不同 layout 用不同寫法：`/quick-entry` 用 stacked（icon→群組名小字→分類名）、列表用 inline `·` 或 `/` 前綴
  - aria-label 一律改為 `{groupName} {name}`，無障礙更明確
  - 5 個新 util 單元測試 + 既有 data.test.ts 對應預期值更新

### Changed — Data layer

- `types.ts`：`ReportBreakdownItem` 加 optional `groupName?: string`
- `data.ts`：`fetchReportsData` 計算 categoryRows 時帶上 group name；用 `flatMap` 取代 map+filter type predicate

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（18 test files / 69 tests 全綠，淨增 5 個 categoryDisplay 測試）
- `npm run build`（14 routes 全部編譯成功）

## [v2.1] - 2026-05-08 — Material 3 全站完整化 + Legacy 清理

### Changed — 完整 M3

- `/reports` summary cards (income/expense/allocated/unallocated 用 money tonal containers) + 細項支出 + 支付方式列表全部改 M3
- `/transactions` 篩選器 + 列表完整 M3（含搜尋 input、5 個篩選欄位、排序 select、CSV 匯出按鈕）
- `/transactions` 內的 `TransactionList` 元件完整 M3 重寫：list 用 cat icon avatar、編輯 modal 用 surface + elev-3、刪除 confirm modal 用 M3Button
- `/budget-allocation` 內部 group rows + admin 功能（rename/delete/reorder group、create/rename/delete category、quick toggle、payment method 管理）全部改 M3
- `/settings/ynab-import` 完整 M3（之前漏做）
- `MonthSwitcher` 元件改 M3（之前是 chrome-window）
- `Toast` 元件改 M3（success/error/info 對應 money / surface tonal containers）
- `LoadingCard` / `StateCard` 元件改 M3
- `EntryFieldChip` 元件 token 改 M3
- `PageQuickNav` 浮動選單改 M3（surface + elev-3 + primary-container 標示 active）

### Removed — Legacy 清理

- `src/components/BudgetList.tsx`（v2.0 Step 3.2 Dashboard 重寫後變孤兒）
- `src/lib/groupTone.ts`（v2.0 後分類顏色全用 M3 cat palette + categoryStyle 對應，groupTone 不再被任何頁面使用）
- `tailwind.config.ts` 整個 chrome / neu / ink / paper / sun / mint / coral / sand / led / panel / legacy.primary 系列 tokens 全部移除（包括 chrome shadow / chrome bg gradient / chrome 字型 / chrome spacing / chrome rounded / chrome transition）
- `src/app/globals.css` 移除 chrome-window / chrome-titlebar / chrome-statusbar / chrome-btn / chrome-field / chrome-led-panel 等 75 行 chrome custom CSS，body background 改 M3 #fafbfd
- 各頁面內所有 `chrome-` / `bg-paper` / `text-paper` / `font-display` 類別全部清空（grep 驗證 0 occurrences）

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（17 test files / 64 tests 全綠）
- `npm run build`（14 routes 全部編譯成功）

### v2.2 候選

- **Inflow 收入記帳**：DB schema 改動（`amount > 0` constraint 解開 + 加 `type` 欄位），quick-entry 收入/轉帳 segments 改成可運作；報表 / dashboard / budget-usage 增加 income vs expense 區分
- 字型載入優化（移除 next/font 副作用，用 system stack）
- 暗色模式（M3 dark theme tokens 已在 design-tokens.json 有定義，但未實作）
- 國際化（目前只有正體中文）

## [v2.0] - 2026-05-08 — Material 3 設計改版完成（WIP → ready for review）

### Step 3.3 — `/budget-usage`（完整 M3）

- 重寫為 BudgetUsageA Progress List 風格：header / 月份 + scope chips / 4 summary cards / overspent banner / 平面化分類列表（依使用率排序，超支在前）
- 4 個整合測試（M3 layout / overspent banner / sort / scope toggle）

### Step 3.4 — `/budget-allocation`（partial M3）

- Page wrapper + sticky 收入/已分配/剩餘卡片改 M3 風格
- 內部 group rows 與 admin 功能（rename group/category、create category、reorder、delete、payment-method 管理、copy 上月、批次套用 auto budget）暫留 chrome 樣式
- 程式內以註解 `[v2.0 Step 3.4 partial M3]` 標記，留待 v2.1 完整重寫

### Step 3.5 — 其他頁

- **`/login`** 完整 M3：primary-container hero + segmented toggle + M3 TextField + M3 Button（取代既有 ink/paper/sun/mint 自訂風格）
- **`/settings`** 完整 M3：top bar / 帳號卡 / 4 格 overview / 4 個 shortcut links（每個有 primary-container icon avatar + chevron）
- **`/transactions`** partial M3：header + 筆數/總金額 summary 改 M3，內部篩選器與 TransactionList 列表暫留 chrome（TransactionList 給 dashboard 也用過，整體重寫留 v2.1）
- **`/reports`** partial M3：header 改 M3，內部 summary 卡與分類明細表暫留 chrome

### v2.0 重構摘要（Step 1–3.5 累積）

- 設計系統：Winamp 鍍鉻 → Material 3 light（M3 tonal palette + Roboto/Noto Sans TC/Roboto Mono + tabular-nums）
- 8 個 m3 共用元件（Card / Button / Chip / TextField / Progress / **MoneyText** / Fab / AppBar）
- 全站金額顯示走 `<MoneyText>`（mono + tnum + 千分位 + 語意化顏色 + 自動 ± 前綴）
- 分類視覺：M3 cat palette（food / transport / shop / home / health / fun）+ lucide icon keyword 對應
- 全部 7 條主要 routes 都過了 M3 第一輪改造（其中 4 條完整、2 條 partial、1 條 deferred）
- vitest 加 `@vitejs/plugin-react`，永久解決 Next build 改 tsconfig.json `jsx: preserve` 後測試壞的問題
- 0 schema 變動、0 環境變數變動、0 v1.0 功能回歸

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（17 test files / 64 tests 全綠）
- `npm run build`（14 routes 全部編譯成功）

### v2.1 候選清單（v2.0 沒做完的）

- `/budget-allocation` 內部 group + admin 功能完整 M3 重寫
- `/transactions` 篩選器 + 列表完整 M3 重寫
- `/reports` summary cards + 分類明細表完整 M3 重寫
- `Inflow（收入）` 完整支援（要 DB schema 加 type 欄位 + transactions amount > 0 constraint 解開）
- 移除 `legacy.primary` 與所有 chrome-* / neu-* / ink/paper/sun/mint/coral/sand tokens（等所有頁面都不再使用後）
- 移除 `BudgetList.tsx`（Step 3.2 後變孤兒）
- `MonthSwitcher` 元件 M3 化（目前是 chrome 風）

## [v2.0 Step 3.2] - 2026-05-08 — `/` Dashboard 套 Material 3

### Changed

- **`src/app/page.tsx` 重寫為 M3 DashboardA 風格**：
  - 頂部：簡化 month switcher（標題 + 月份標籤 + 上下月按鈕，去掉 Lite YNAB 標題列）
  - **Hero balance card**（`bg-primary-container`）：本月剩餘預算（hero size MoneyText）+ 預算總額 / 已用百分比 + Progress bar + 「記一筆」連結到 `/quick-entry`
  - **3 個 tonal 卡**：收入（綠 container）/ 支出（紅 container）/ 結餘（藍 container），收入卡可點擊開編輯 dialog
  - **分類預算 grid**（2 cols）：每張卡片用 M3 cat icon + 名稱 + 百分比 + 已支出/預算 + Progress bar；右上「編輯 →」連結到 `/budget-allocation`
  - **最近交易**：read-only 列表 5 筆，「查看全部 →」連結到 `/transactions`
  - **新增收入編輯 dialog**：點收入卡開啟，inline 改金額然後 upsert `monthly_incomes`

### Removed

- 從 dashboard 移除「FAB → 內嵌 expense modal」流程：原本的快速記帳彈窗在 v2.0 統一到 `/quick-entry` 頁面，dashboard hero card 的「記一筆」按鈕直接連去
- 從 dashboard 移除 inline budget 編輯（`BudgetList` 元件不再被使用，標記為待清理；budget 編輯一律去 `/budget-allocation`）
- 從 dashboard 移除 inline transaction 編輯（`TransactionList` 仍由 `/transactions` 使用，dashboard 改用簡化的 read-only 列表）

### Added

- 用到的 M3 元件：`MoneyText`、`Progress`、`Button`，加上 `categoryStyle.ts` 對 cat color/icon 的對應

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（17 test files / 61 tests 全綠，dashboard 測試重寫為 4 個 case：hero + tonal cards、categories + recent、記一筆 link、收入 dialog upsert）
- `npm run build`（14 routes，`/` 7.06 kB / 188 kB First Load JS）

### UX 變更 vs v1.0

- ⚠️ **Dashboard 變只讀為主**：要編輯 budget / 交易需要點到專門頁。Single-page YNAB 體驗變成更典型的「總覽 + 分散」。對連續操作的使用者多 1-2 個 click。
- ⚠️ **`BudgetList` 元件變孤兒**：等所有 v2.0 頁面遷移完成後，在 cleanup phase 移除（連同 chrome legacy tokens）

### Notes

- 對應 HANDOFF.md Step 3.2。

## [v2.0 Step 3.1] - 2026-05-08 — `/quick-entry` 套 Material 3

### Changed

- **`src/app/quick-entry/page.tsx` 重寫為 M3 QuickEntryA 風格**：
  - 頂部 ✕ + 「記一筆」+ ⚙ 三段式 app bar
  - 支出 / 收入 / 轉帳 segmented control（v2.0 只開放支出，點收入/轉帳會 toast「v2.1 即將支援」，UI 保留視覺）
  - Amount 卡片用 `bg-primary-container`，金額用 `<MoneyText size="display" />`，自動處理 ±$ 與 tabular-nums
  - 1 排 6 個常用分類（icon + 名稱），分類顏色用 `categoryStyle.ts` 對 M3 cat palette 做 keyword 匹配（飲食→food、交通→transport、咖啡→food、健康→health、房租→home、娛樂→fun…）
  - 「更多分類 →」按鈕在分類下方獨立一行，開既有 CategoryPickerModal
  - 支付方式 chips 改用 M3 `<Chip>`（selected 自動切 secondary-container）
  - 數字鍵盤 4×3 改 M3 風（`bg-surface-container` + `text-num-title` + mono）
  - **行為改變**：從 v1.0「點分類即送出」改為 M3 顯式「儲存」按鈕（多一步，符合設計稿）
- `src/components/PaymentMethodModal.tsx` 重新樣式為 M3：M3 surface + elev-3 + rounded-md，選中項用 primary-container，無垢漸層
- `src/components/CategoryPickerModal.tsx` 同樣 M3 化，群組顏色點改用 cat palette
- `src/lib/categoryStyle.ts` 新增：分類名稱 → M3 cat 顏色 + lucide icon 對應的 keyword 規則表

### Added

- `vitest.config.ts` 加 `@vitejs/plugin-react` plugin，**永久解決 Next.js build 把 tsconfig `jsx` 改 `preserve` 後測試失效** 的問題（之前每次 build 後要手動改回 react-jsx）。`@vitejs/plugin-react` 為 dev dependency。

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（17 test files / 60 tests 全綠，9 個 quick-entry 整合測試覆蓋新 UI 與行為）
- `npm run build`（14 routes 全部編譯成功，`/quick-entry` 7.36 kB / 188 kB First Load JS，比 v1.0 增加 ~2 kB）

### UX 變更 vs v1.0

- ⚠️ **點分類即送出消失**：v2.0 需要顯式按「儲存」。連續記帳的速度會變慢（v1.0 = 1 click，v2.0 = 2 click）。如使用者反映過慢可考慮在 v2.1 加回 long-press 或設定切換。
- ⚠️ **3×3 grid → 1×6 + 更多按鈕**：常用分類數量上限從 8 個變成 6 個（多的進「更多分類」modal）

### Notes

- Inflow（收入）DB schema 還沒做（`amount > 0` constraint），`/quick-entry` 收入 segment 是 placeholder。
- 對應 HANDOFF.md Step 3.1。

## [v2.0 Step 2] - 2026-05-07 — Material 3 共用元件

### Added

- `src/components/m3/` 8 個共用元件 + barrel `index.ts`：
  - `MoneyText.tsx` — 金額顯示（mono + tabular-nums + tnum + 千分位 + 語意化顏色 + 自動 ± 前綴），這是全站金額統一入口。API：`<MoneyText value={1280} type="expense" size="display" />`
  - `Card.tsx` — 三 variant（outlined / elevated / filled）
  - `Button.tsx` — 四 variant（filled / tonal / outlined / text），含 startIcon / endIcon
  - `Chip.tsx` — selected 狀態自動切 secondary-container
  - `TextField.tsx` — 含 label + helperText + error 狀態，`numeric` prop 切置中 + mono
  - `Progress.tsx` — variant 支援 primary / expense / warn / income，含 a11y `progressbar` role
  - `Fab.tsx` — 三 size + extended 模式
  - `AppBar.tsx` — leading + title + actions 三段式
- `src/components/m3/MoneyText.test.tsx` — 8 個 case（千分位、預設前綴、prefix=false、showCurrency=false、size/type class、負數、decimals）

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（17 test files / 60 tests 全綠，淨增 8 個 MoneyText 測試）

### Notes

- 這些元件 **尚未被任何頁面使用**。Step 3 開始才會逐頁套到 `/quick-entry`、`/`、`/budget-usage`、`/budget-allocation`。
- 對應 HANDOFF.md Step 2。

## [v2.0 Step 1] - 2026-05-07 — Material 3 設計系統切換

### Changed

- 設計系統視覺方向：從 Winamp 金屬鍍鉻擬物化（v1.0）改為 Material 3 淺色明亮（v2.0）。
- `design/design-tokens.json`、`design/DESIGN-SPEC.md`、`design/components.md`：覆蓋為 M3 規範。
- `tailwind.config.ts`：新增 M3 命名空間（primary/secondary/surface/on-surface/outline/money/cat），新增 M3 fontSize（label/body/title/headline/display/num-hero/num-display/num-title）、borderRadius（xs/sm/md/lg/full）、boxShadow（elev-1/2/3）、transition（m3-standard、m3-short/medium/long）。
- `tailwind.config.ts`：v1.0 的 `primary`（深藍 #1A1A2E）搬到 `legacy.primary`，僅 `groupTone.ts` 仍引用，待頁面遷移後一併清理。
- `src/lib/groupTone.ts`：primary preset 改用 `legacy-primary-*` class 名稱，避免與 M3 新 `primary` 衝突。
- `src/app/layout.tsx`：用 `next/font/google` 引入 Roboto + Noto Sans TC + Roboto Mono，掛在 `<html>` 上的 CSS 變數（`--font-roboto`、`--font-noto-sans-tc`、`--font-roboto-mono`），由 Tailwind `font-sans` / `font-mono` 引用。
- `tsconfig.json`：`jsx: preserve` → `react-jsx`（Next 15 build 會再自動改回；vitest/rolldown 需要 react-jsx 才能解析 .test.tsx，所以這個值會在 dev 與 build 之間切換，這是正常的）。

### Added

- `design/material3/Lite YNAB Material 3.html`：完整 hi-fi 設計稿（4 個變體頁面），可直接在瀏覽器打開查看。

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（16 test files / 52 tests 全綠，無回歸）

### Notes

- v1.0 的 chrome-* / neu-* / success/danger/warning/info 等命名 **保留 top-level** 不動，現有頁面繼續使用，等逐頁遷移完成後 cleanup。
- 對應 handoff 文件：`HANDOFF.md`（Step 1 完成）。

## [Sprint 6] - 2026-05-07

### Released

- v1.0：quick-entry 介面重做完成（密集 1 屏、9 格分類 grid、PaymentMethodModal、CategoryPickerModal）。

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（16 test files / 52 tests 全綠）
- `npm run build`（14 routes 全部編譯成功，所有頁面 size 正常：`/quick-entry` 5.42 kB / 186 kB First Load JS）

### Notes

- 待人類在實機驗證（worktree 沒帶 `.env.local`，dev server 跑不起來）。
- 部署：等 PR merge 到 main 後 Zeabur 自動 redeploy。

## [Sprint 5] - 2026-05-07

### Added

- 邊界情況：`paymentMethods.length === 0` 顯示 banner 引導 `/settings`，並阻擋送出（toast「請先到設定建立支付方式」）。
- 邊界情況：`quickCategories.length === 0` 顯示提示文字「尚未標記常用分類，點『+ 更多』選擇分類」，「+ 更多」按鈕仍保留為入口。
- 4 個新測試（noPaymentMethods banner、空 quickCategories 提示、開啟 CategoryPickerModal、開啟 PaymentMethodModal）。

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（16 test files / 52 tests 全綠）

## [Sprint 4] - 2026-05-07

### Added

- `src/components/CategoryPickerModal.tsx`：全分類搜尋 + 選擇 modal，依 groupName 分區顯示，搜尋比對 `groupName + name`。
- `src/components/CategoryPickerModal.test.tsx`：6 個測試（closed、grouped 渲染、filter、選擇、空結果、disabled）。
- `quick-entry/page.tsx` 整合：點「+ 更多」開啟 modal，選定後直接送出（重用 `submitTransaction`）。

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（16 test files / 48 tests 全綠）

## [Sprint 3] - 2026-05-07

### Added

- `src/lib/hooks/useModalLifecycle.ts`：modal 共用生命週期 hook（body scroll lock + ESC + Android 返回鍵 popstate）。Sprint 4 也共用。
- `src/components/PaymentMethodModal.tsx`：切換支付方式 modal，含 overlay click + 卡片 stopPropagation。
- `src/components/PaymentMethodModal.test.tsx`：5 個測試（closed、open + highlight、onSelect/onClose、overlay 行為、ESC + body scroll lock）。
- `quick-entry/page.tsx` 整合：點支付方式 chip 開啟 modal，選定後寫 localStorage 並更新 chip。

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（15 test files / 42 tests 全綠）

## [Sprint 2] - 2026-05-07

### Changed

- `src/app/quick-entry/page.tsx`：重寫為密集 1 屏 layout（金額列 + 9 格分類 grid + 備註 + keypad）。
- `src/lib/groupTone.ts`：每個 preset 新增 `dot` class（純背景色），供 9 格 grid 左上角 6×6 群組顏色點使用。
- `src/app/quick-entry/page.test.tsx`：改寫為新版測試（5 個 case：layout 標題、keypad/note 輸入、amount=0 阻擋、成功送出 + reset、「+ 更多」入口）。

### Added

- 9 格常用分類 grid（前 8 + 「+ 更多」入口固定為最後一格）。
- 點分類即送出邏輯（保留既有快速感），含 amount=0 toast 與 isSubmitting 鎖。
- 跨日防呆：`hasUserModifiedDate` flag 確保送出當下重抓 `getTodayInTaipei()`，除非使用者主動改過 date。

### Fixed

- 移除 useEffect dep 中的 `router` / `supabase`（在測試環境下 mock 會回傳新 ref，造成無限重抓 loop）。

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（14 test files / 37 tests 全綠）

## [Sprint 1] - 2026-05-07

### Added

- `src/lib/hooks/useLastPaymentMethod.ts`：localStorage 記住上次支付方式，stored id 失效時自動 fallback 到 `paymentMethods[0]`。
- `src/components/EntryFieldChip.tsx`：通用 pill 形 chip 元件（rounded-chrome-pill + 1px border，無立體 inset shadow）。
- `src/lib/hooks/useLastPaymentMethod.test.ts`：5 個情境測試（空 localStorage、有效 id、失效 id、寫回 localStorage、空 paymentMethods）。

### Verified

- `npm run typecheck`（0 errors）
- `npm run test`（14 test files / 36 tests 全綠，新增 5 個）

## [Sprint 0] - 2026-05-07

### Changed

- 啟動 quick-entry 介面重做（SPEC v1.0），於 worktree 分支 `claude/busy-hellman-b32b7e` 上進行（沿用 worktree 流程，不另開 `feature/quick-entry-redesign`）。

### Verified

- `npm install`
- `npm run typecheck`（0 errors）
- `npm run test`（13 test files / 31 tests 全綠）

### Notes

- 對應 SPEC：`SPEC-lite-ynab-quick-entry-redesign.md`（v1.0，2026-05-07）
- 本 Sprint 不變更程式碼，僅環境準備與起手紀錄。

## 2026-05-07

### Fixed

- 修正報表日期範圍：選擇結束月份時，不再額外多抓下一個月的交易。
- 修正多月報表分類統計：同一分類跨多個月份有多筆預算時，不再重複計算支出金額與交易筆數。

### Verified

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `git diff --check`

### Notes

- PR: #2
- Commit: `2546055 fix: correct report range aggregation (#2)`
- 無資料庫 migration 或環境變數異動。

## 2026-04-13

### Added

- 新增使用者操作手冊，方便跨裝置接手時快速了解 Lite YNAB 的主要頁面與日常使用方式
- 新增專案 QA / Notion 筆記 Markdown，整理專案背景、驗收重點與常見問題
- 新增瀏覽器 AI 測試 prompt 文件，方便後續在其他電腦上延續自動化測試流程

### Changed

- 將 `.claude/` 本機工作目錄加入 `.gitignore`，避免把本機代理工作樹同步進 GitHub

### Verified

- `git status`

## 2026-04-11

### Added

- 新增 YNAB 匯入器頁面，可貼入 Personal Access Token、讀取 YNAB 計畫並建立匯入預覽
- 新增 `/api/ynab` 路由，透過官方 YNAB API 讀取 plans、accounts、categories、transactions
- 新增 YNAB 資料整理與 Lite YNAB 寫入邏輯，支援大項分類、小項分類、支付方式與支出交易匯入

### Changed

- 設定頁新增「匯入 YNAB 歷史資料」入口，直接連到新的匯入工具

### Verified

- `npm run typecheck`
- `npm run test`

## 2026-04-11

### Fixed

- 新增登入後自動執行的英文重複分類補救流程，避免部署平台未執行 Supabase migration 時，`Food`、`Fun Money` 等舊分類持續殘留在線上資料中
- 自動將英文分類底下的交易搬移到同群組對應的中文分類
- 自動將英文分類底下的預算合併到對應的中文分類，並在缺少中文分類時補建目標分類
- 完成搬移後自動刪除英文重複分類，避免分類、報表、快速記帳與交易清單再次出現中英並存
- 修正首頁右下角浮動按鈕文案，避免顯示成 `+ + 記帳`

### Verified

- `npm run typecheck`
- `npm run test`

## 2026-04-05 (部署更新)

### Added

- 新增自訂 Dockerfile，使用 `node:20-alpine` 多階段建置
- 正式部署至 Zeabur，正式網址：https://lite-ynab.zeabur.app/
- 設定 Supabase 環境變數（`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`）

### Fixed

- 修正 Zeabur 自動產生的 Dockerfile 使用 node:22 導致 `npm update -g npm` 的 `MODULE_NOT_FOUND` 錯誤
- 修正 `npm ci` 因 `package.json` 與 `package-lock.json` 不同步而失敗，改用 `npm install`
- 修正 Dockerfile 中 `COPY --from=builder /app/public ./public` 因專案無 public 目錄而建置失敗

### Verified

- 全部 6 個頁面驗證通過（`/`、`/quick-entry`、`/budget-allocation`、`/budget-usage`、`/transactions`、`/reports`）
- 未登入狀態正確導向 `/login`
- 登入頁 UI 完整呈現（品牌標題、登入/建立帳號切換、表單）

---

## 2026-04-05

### Added

- 新增預算使用頁：
  - `src/app/budget-usage/page.tsx`
  - 提供今天 / 本月切換
  - 顯示已支出、剩餘可用、超支項目
  - 以儀表板方式呈現各分類花費狀況
- 新增正式版表格式預算分配頁：
  - `src/app/budget-allocation/BudgetAllocationPageClient.tsx`
  - 置頂摘要區
  - 本月預算與固定預算自動儲存
  - 大項收合 / 展開
  - 大項與小項齒輪設定
  - 支付方式管理
- 新增預算使用與新版預算分配對應測試

### Changed

- `/budget-allocation` 已正式切換到新版表格式預算分配頁
- `/budget-allocation-compact` 改為自動導向 `/budget-allocation`
- 預算分配頁標題由 `預算分配中心試作版` 改為正式的 `預算分配中心`
- 預算分配與預算使用完成情境拆分：
  - 預算分配負責月初設定
  - 預算使用負責查看花費與剩餘
- 頁面選單整合：
  - 上一頁
  - 主控臺
  - 快速記帳
  - 預算分配
  - 預算使用
  - 全部交易
  - 報表
  - 帳號資訊與登出

### Fixed

- 修正多個路由 layout 重複輸出 `<html><body>` 造成的 hydration 錯誤
- 修正頁面選單點擊無反應與被底部操作列遮擋問題
- 修正正式版預算分配測試與路由切換後文案不一致問題
- 修正文件亂碼

## 2026-04-04

### Added

- 新增完整交易頁強化：
  - 日期區間篩選
  - 金額區間篩選
  - 排序
  - 匯出交易 CSV
- 新增報表頁強化：
  - 月對月比較
  - 日期區間報表
  - 趨勢圖
  - 預算 vs 實際支出
  - 支付方式分析
  - CSV / Excel 匯出
- 新增 `CHANGELOG.md`

### Changed

- 主控臺、快速記帳、預算分配、交易、報表逐步對齊控制台風格
- 主控臺與預算分配分工明確化
- 頁面頂部藍色標題列與頁面選單逐步統一

### Fixed

- 修正多頁面寬度不一致
- 修正輸入框對齊、字體過貼左框
- 修正多處 UI 遮擋與重複入口問題

## 2026-04-03

### Added

- 新增預算分配中心
- 新增大項 / 小項分類管理
- 新增支付方式管理
- 新增完整交易頁
- 新增報表頁
- 新增 Vitest / Testing Library 測試護欄

### Changed

- UI 中文化
- README 中文化
- 預設分類與預設支付方式改為繁體中文

### Fixed

- 修正 `bootstrap_default_categories()` 與使用者 ID 相關問題
- 修正 `.next` 與開發環境快取帶來的樣式 / 畫面異常

## 2026-04-02

### Added

- 初始化 Lite YNAB 專案
- 建立 Next.js + TypeScript + Tailwind CSS + Supabase 架構
- 建立初始資料表、RLS 與 migration
