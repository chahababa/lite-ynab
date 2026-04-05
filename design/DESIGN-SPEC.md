# UI 設計規範｜Winamp 金屬鍍鉻擬物化（Chrome Skeuomorphism）

## 一、風格定調
- 風格定義：千禧年控制室的冷冽金屬，強調機械感、掌控感與明確回饋。
- 視覺關鍵字：拉絲金屬、LED 儀表板、控制室、實體按壓感。
- 靈感來源：Winamp 2.x Classic Skin、Windows 98 對話框、千禧年 PC 硬體面板。

## 二、Design Tokens
- 完整 tokens 請參考 `design/design-tokens.json`。
- 主要使用 chrome 色階、panel-dark、led-green / amber / red。
- 字體以 `Tahoma`、`Verdana`、`Courier New` 為核心。

## 三、Tailwind 規則
- 已合併進 `tailwind.config.ts`。
- 不另外建立 `tailwind.config.js`，避免破壞現有專案設定。

## 四、核心組件
- 詳見 `design/components.md`。
- 基準元件：
  - Chrome Button
  - LED Display Panel
  - Chrome Window Frame

## 五、開發規則
1. 顏色使用語意化 tokens，不在元件中硬寫任意 hex。
2. 字體以 `Tahoma / Verdana / Courier New` 為主，不混入現代扁平化字體系統。
3. 間距以 4px 為倍數，整體排版偏緊湊。
4. 圓角不超過 12px。
5. 可點擊元素必須有 hover / active / disabled 狀態。
6. 先局部試做，再決定是否擴散到其他正式頁面。
7. 同一功能區塊內，按鈕、卡片、輸入框要維持同一套視覺語言。
8. 文字不要緊貼左邊框。
9. 純數字輸入框一律置中顯示。
   - 例如：收入、預算、固定金額、數量、金額
   - 文字型輸入框維持左對齊
10. 大項分類標籤必須使用固定且可區分的色系。
   - 例如：個人、家庭、吉他、其他各自使用不同顏色
   - 新建立的大項也要自動分配不同色系

## 六、禁止事項
- 禁止只用現代白卡片語言去模仿這套風格。
- 禁止省略 hover / active 狀態。
- 禁止把整站一次改完而不做局部驗證。
- 禁止讓可編輯欄位的文字貼齊邊框。

## 七、目前驗證範圍
- `快速記帳` 已作為第一個風格驗證頁面。
- 其他頁面在驗證通過後逐步對齊相同風格。
