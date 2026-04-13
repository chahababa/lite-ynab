# Lite YNAB 專案 QA 筆記

> 這份文件使用 Markdown 撰寫，適合直接貼到 Notion 作為專案知識庫、交接文件或 FAQ 頁面。

## 專案簡介

### Q：這個專案是做什麼的？

A：Lite YNAB 是一套輕量化的記帳與預算管理系統，提供登入、快速記帳、預算分配、交易管理、報表查看與匯出等功能。

### Q：這個專案目前用什麼技術？

A：主要技術如下：

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- Vitest + Testing Library

### Q：目前的 UI 風格是什麼？

A：專案 UI 以 `design/` 內定義的 Winamp 金屬鍍鉻擬物化風格為準。做 UI 修改時應先參考：

- `design/DESIGN-SPEC.md`
- `design/components.md`
- `design/design-tokens.json`

## 功能面 QA

### Q：系統目前有哪些核心功能？

A：

- 登入 / 登出
- 主控臺
- 快速記帳
- 預算分配
- 預算使用情況
- 交易清單
- 報表查看與匯出
- 分類與支付方式管理

### Q：使用者最常走的操作流程是什麼？

A：

1. 登入
2. 設定本月收入
3. 分配本月預算
4. 記錄支出
5. 查看是否超支
6. 檢查報表與交易明細

### Q：快速記帳和主控臺記帳有什麼差別？

A：兩者都能新增支出，但定位不同：

- 主控臺記帳：適合在桌面操作時，搭配最近交易一起看
- 快速記帳：適合手機或快速輸入場景，流程更精簡

### Q：預算分配頁可以做什麼？

A：

- 編輯本月收入
- 調整分類預算
- 複製上月預算
- 套用固定預算
- 切換分類是否為快速記帳
- 管理分類
- 管理支付方式

## 開發面 QA

### Q：本機開發要怎麼跑？

A：

```powershell
npm install
npm run dev
```

### Q：開發前需要設定哪些環境變數？

A：至少需要：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Q：開發時建議跑哪些檢查？

A：

```powershell
npm run typecheck
npm run test
```

### Q：為什麼不建議在 `npm run dev` 開著時再跑 `npm run build`？

A：因為這個專案在 Windows 本機開發時，`.next` 快取可能互相影響，造成不必要的錯誤或快取污染。

## 資料與 Supabase QA

### Q：這個專案主要資料表有哪些？

A：

- `category_groups`
- `categories`
- `payment_methods`
- `monthly_incomes`
- `budgets`
- `transactions`

### Q：這個專案依賴哪些 RPC？

A：

- `bootstrap_default_category_groups()`
- `bootstrap_default_categories()`
- `bootstrap_default_payment_methods()`
- `initialize_monthly_budget(text)`

### Q：為什麼有些頁面一進去就會自動有預設資料？

A：因為系統會在登入或載入某些頁面時，自動執行預設資料 bootstrap 與每月預算初始化流程。

### Q：刪除分類或支付方式時要注意什麼？

A：

- 刪除分類可能會影響預算與交易資料
- 刪除支付方式時，若仍有交易綁定，資料庫可能會阻擋刪除
- 正式環境操作前建議先確認資料關聯

## 測試 QA

### Q：目前有測試嗎？

A：有，專案目前使用 Vitest 與 Testing Library，已涵蓋多個頁面與資料邏輯測試。

### Q：遇到測試失敗時，第一步應該看什麼？

A：

- 先看是型別錯誤、資料 mock 錯誤，還是 UI 文字比對失敗
- 若剛新增資料函式或修改匯入，先檢查測試 mock 是否同步更新
- 若剛調整文案，先檢查測試斷言文字是否仍沿用舊字串

### Q：這類專案最常見的測試回歸原因有哪些？

A：

- 元件文案改名，但測試仍找舊文字
- 新增 API / data helper，但測試 mock 沒補
- 互動流程變動，導致查找元素時機不同
- 空狀態文案改了，測試查找失敗

## UI / UX QA

### Q：這個專案的 UI 修改最重要的規則是什麼？

A：

- 使用者可見文字一律繁體中文、台灣用語
- 盡量使用語意化 design token，不要直接硬寫色碼
- 相同功能元件保持一致視覺語言
- 互動元件必須有 hover / active / disabled 狀態
- 純數字輸入框置中顯示

### Q：可以一次大改整站風格嗎？

A：不建議。專案規則是先局部試作，再決定是否擴散到其他頁面。

### Q：目前最需要注意的 UI 品質問題是什麼？

A：

- 文件與部分歷史內容可能有亂碼殘留
- 使用者文案必須持續維持繁中一致性
- 若新增頁面，應延續既有 Chrome 擬物風格

## 維運與交接 QA

### Q：目前專案裡原本就有完整文件嗎？

A：有基礎文件，但不是全部都適合直接當正式手冊使用：

- `README.md`
- `STATUS.md`
- `DEPLOYMENT.md`
- `CHANGELOG.md`

其中部分文件目前仍有亂碼或歷史內容混雜，建議搭配這次新增的說明文件一起看。

### Q：這次另外補了哪些文件？

A：

- `USER_GUIDE.md`
  - 給使用者或接手者的使用說明書
- `PROJECT_QA_NOTION.md`
  - 給 Notion 知識庫用的專案 QA 筆記

### Q：如果後續要繼續補文件，建議優先補哪幾種？

A：

- 部署流程手冊
- 測試策略說明
- Supabase schema / RPC 對照
- 產品操作教學圖文版
- 常見錯誤排查手冊

## 建議後續整理項目

### Q：下一步最值得補強的是什麼？

A：

1. 整理並重寫 `README.md`
2. 整理 `STATUS.md`，讓專案現況更清楚
3. 補一份工程交接文件，說明資料流、頁面責任與 Supabase 關聯
4. 把常見錯誤與修復方式整理成 troubleshooting 文件

---

如果要貼到 Notion，通常直接整份貼上就可以保留標題層級；如果你要，我下一步也可以再幫你做一版更像 Notion 頁面結構的「目錄版」或「交接版」。
