# CHANGELOG

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
