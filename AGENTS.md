# AGENTS.md

## 專案概述
lite-ynab：輕量化記帳系統。  
技術棧：Next.js + TypeScript + Tailwind CSS + Supabase。

## 目前 UI 風格
- 採用 `design/` 內定義的 Material 3 Light & Bright 視覺方向（淺色明亮、tonal surfaces、語意化金錢顏色）。
- 先前 Winamp 金屬鍍鉻擬物化規範已由 `design/DESIGN-SPEC.md` v2.0 淘汰與封存；新 UI 不使用金屬漸層、emboss/inset/outset 效果。
- 所有 UI 修改前，優先參考：
  - `design/DESIGN-SPEC.md`
  - `design/components.md`
  - `design/design-tokens.json`

## 專案結構
- `src/`：主要前端與應用程式碼
- `supabase/`：資料庫 migration 與設定
- `design/`：設計規範與 tokens
- `tailwind.config.ts`：Tailwind 設定
- `.env.local`：環境變數，不可修改或提交

## 開發指令
- 安裝套件：`npm install`
- 開發伺服器：`npm run dev`
- 型別檢查：`npm run typecheck`
- 測試：`npm run test`

## UI 規則
- 使用者可見文字一律使用繁體中文、台灣用語。
- 顏色優先使用語意化 tokens，不在元件中硬寫任意色碼。
- 同一頁中，相同功能的卡片、按鈕、輸入框必須使用一致的視覺語言。
- 大項分類標籤必須使用可辨識的固定色系。
  - 例如：個人、家庭、吉他、其他應各自有不同顏色
  - 新建立的大項也必須自動分配不同色系，避免全部同色
- 所有互動元素必須有 hover / active / disabled 狀態。
- 文字不要緊貼輸入框或卡片左邊界。
- 純數字輸入框一律置中顯示。
  - 例如：本月收入、本月預算、固定金額、金額類欄位
  - 文字型輸入框維持左對齊

## 風格試作原則
- 新風格先局部試作，再決定是否擴散到其他頁面。
- 避免一次改整站，除非該風格已經在至少一個核心頁面驗證通過。

## 注意事項
- 避免在 `npm run dev` 執行期間再跑 `npm run build`，以免 Windows 本機 `.next` 快取互相踩到。
- 非使用者明確要求時，不修改 `.env.local` 與 `supabase/` 下的 migration。
