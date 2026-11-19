# STATUS

更新日期：2026-11-19

## 最新變更（2026-10-23 ～ 2026-11-12）

- 正式部署自 Zeabur 搬到 Railway，正式網址改為 https://ynab.hoochuu.com.tw/ （舊網址 lite-ynab.zeabur.app 並行至 2026-12-01）；步驟與變數名稱清單見 `docs/railway-migration-20261023.md`
- 每日備份排程器的正式端點守衛改為 ynab.hoochuu.com.tw
- 加網站圖示（favicon／apple-touch）
- 固定打包字型，修復正式建置與 CI（2026-11-12）
- 開發環境注意：Supabase 的 legacy anon key 已停用，本機 `.env.local` 的 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 要改填 `sb_publishable_` 開頭的 publishable key

## 資料庫環境現況（2026-11-19 盤點）

- 正式：Supabase 專案「Lite YNAB」。已套用 18 個 migration；repo 內的 `20260917040000_tenant_scoped_monthly_budget_reset.sql` 是 repository-only，**刻意未套用**，程式也仍呼叫舊版 `reset_monthly_auto_budgets(text)`，兩邊一致
- 測試：Supabase 專案「lite-ynab-staging」。2026-11-19 補套 3 個 migration（月初始化收入帶入、引用歸屬檢查、交易來源唯一性），目前與正式的差異只剩兩個 CTBC migration 未套
- 本機開發預設連 staging，做法見 README「本機啟動」

## 前次變更（2026-10-08）：CTBC 信用卡通知收件匣（預設關閉）

- 新增持久化 CTBC 審核收件匣與 Gmail worker（`src/lib/ctbcCollector.ts`、`src/lib/ctbcWorker.ts`、`npm run worker:ctbc`），說明見 `docs/ctbc-inbox-implementation.md`
- 全部由環境變數守門：`CTBC_INBOX_ENABLED`、`CTBC_COLLECTOR_ENABLED`、`CTBC_RETENTION_ENABLED` 未設為 `true` 時入口隱藏、API 回 404
- 對應 migration：`20261008002233_ctbc_inbox.sql`、`20261008013654_ctbc_worker_lifecycle.sql`（**已於 2026-10-08 套用正式資料庫**；功能旗標仍關閉，所以線上看不到入口。`docs/ctbc-inbox-implementation.md` 內「未套用正式環境」是合併前的舊敘述）
- 尚未啟用的原因：背景 Gmail 唯讀授權的來源、要綁定的卡片（正卡／附卡）與信箱來源驗證還沒確定
- 交易匯入改為重試安全（retry-safe），交易來源具唯一性約束

## 更早（2026-09-16 ～ 2026-09-17）

- 報表頁：支出圖表、月份比較、桌機版響應式版面
- 每日 Google Sheets 交易備份重建並啟用（序列重試安全、CI 守門）
- 安全基礎：service-role tenant scope fail-closed、每月預算重置依 tenant 範圍、試算表匯出儲存格消毒
- 新增文件：`docs/plans/2026-09-16-lite-ynab-safety-foundation-implementation-plan.md`、`docs/specs/lite-ynab-option-b-travel-domain-spec-v2026-09-16.md`
- 2026-07：快速記帳成為首頁、預算分配引導模式 wizard、底部導覽列、預算結轉、CTBC 通知 dry-run 解析器

## 專案階段

專案目前已進入可實際操作的 beta 階段，並已**正式部署上線**。

正式網址：https://ynab.hoochuu.com.tw/ （Railway；舊網址 lite-ynab.zeabur.app 並行至 2026-12-01）

主流程已可用，並完成：
- 主控臺
- 快速記帳
- 正式版預算分配
- 預算使用儀表板
- 全部交易
- 報表

## 已完成

### 核心功能

- 登入 / 註冊
- 主控臺 Dashboard
- 快速記帳頁
- 預算分配中心
- 預算使用儀表板
- 全部交易要
- 報表頁

### 預算與分類

- 大項分類管理
- 小項分類管理
- 支付方式管理
- 固定預算設定
- 每月預算初始化
- 快速記帳分類設定
- 複製上月預算
- 批次套用固定預算

### 新版預算分配頁

- 表格式預算分配介面
- 本月收入、已分配、剩餘可分配置頂摘要
- 本月預算自動儲存
- 固定預算自動儲存
- 大項收合 / 展開
- 大項齒輪設定
  - 重新命名
  - 刪除大項
  - 新增小項目
- 小項齒輪設定
  - 加入 / 移出快速記帳
  - 重新命名
  - 刪除該項目
- 支付方式管理整塊已補齊

### 預算使用頁

- 今日 / 本月切換
- 已支出與剩餘可用儀表板
- 超支項目統計
- 依使用率排序
- 超支與高使用率項目優先顯示

### 交易與報表

- 快速記帳控制台
- 首頁彈窗記帳
- 交易編修 / 刪除
- 交易搜尋 / 日期區間 / 金額區間 / 排序
- 匯出交易 CSV
- 報表分析
- 支付方式統計
- 報表 CSV / Excel 匯出

### UI / UX

- 主要頁面已整理成同一套控制台風格
- 頁面選單已整合導覽、上一頁、帳號資訊與登出
- 藍色頁首標題列
- 手機寬度版型修正
- 文字不要貼左框
- 數字輸入框置中
- 大項分類標籤加上固定色系

### 測試

- `npm run typecheck` 通過
- `npm run test` 通過
- 2026-11-12 本機實測：`44` 個測試檔、`348` 個測試通過（另 1 個 skipped）

## 目前頁面分工

- `主控臺 /`
  - 日常查看、記帳、最近交易、預算概覽
- `快速記帳 /quick-entry`
  - 極速輸入，偏手機捷徑用途
- `預算分配 /budget-allocation`
  - 月初規劃、分類管理、支付方式管理、固定預算設定
- `預算使用 /budget-usage`
  - 月中 / 月末查看目前已支出、剩餘可用、超支情況
- `全部交易 /transactions`
  - 查帳、篩選、編修
- `報表 /reports`
  - 分析、比較、統計

## 尚未完成

### 功能強化

- 報表頁互動深化
  - 點圖表自動篩選
  - 更細的 drill-down
- 預算使用頁可再補更強的儀表板摘要
- 預算分配頁仍可再做更細節的提示與引導

### 部署與整合

- ~~Zeabur 正式部署~~ ✅ 已完成（2026-04-05）
- ~~搬遷至 Railway（ynab.hoochuu.com.tw）~~ ✅ 已完成（2026-10-24）
- ~~正式環境驗證~~ ✅ 已完成（6 個頁面路由驗證通過）
- ~~Google Sheets 每日交易備份~~ ✅ 已完成（2026-09-17）
- CTBC 收件匣正式啟用：設定背景 Gmail 唯讀憑證與 `CTBC_WORKER_CONFIG`、打開 `CTBC_*` 旗標、部署 worker、本人驗收（資料庫 migration 已套用；目前預設關閉，見 `docs/ctbc-inbox-implementation.md`）
- Zeabur 舊站於 2026-12-01 後收掉

部署紀錄與注意事項已整理在：
- `DEPLOYMENT.md`

### 測試補強

- 更多 edge case 測試
- 端對端測試

## 目前重要規則

- 主控臺與預算分配已經分工
  - 主控臺只保留日常操作
  - 預算分配是唯一管理中心
- 預算分配與預算使用已經分工
  - 預算分配負責月初設定
  - 預算使用負責查看本月花費與剩餘
- 純數字輸入框一律置中
- 文字輸入框文字不要緊貼左框
- 大項分類標籤必須有固定色系

## Migration 清單

- `202604020001_init_lite_ynab.sql`
- `202604030001_fix_default_category_labels.sql`
- `202604030002_fix_auth_function_user_id.sql`
- `202604030003_translate_default_categories_to_zh_hant.sql`
- `202604030004_add_budget_planning_groups_and_payment_methods.sql`
- `202604030005_stop_recreating_deleted_default_categories.sql`
