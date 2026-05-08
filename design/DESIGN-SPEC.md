# UI 設計規範｜Material 3 · Light & Bright

> 本規範取代先前的 Winamp 金屬鍍鉻擬物化規範。
> 視覺方向確認於 v2.0（淺色明亮 / 數字鮮明 / Material 3）。

## 一、風格定調

- **風格定義**：Material 3（Material You），淺色明亮、空氣感強、數字資訊優先。
- **視覺關鍵字**：tonal surfaces、柔和圓角、tabular numerals、語意化金錢顏色。
- **靈感來源**：Google Wallet、Material 3 reference、現代記帳 app（如 Monarch、Copilot）。

## 二、Design Tokens

- 完整 tokens 請參考 `design/design-tokens.json`。
- 主要使用：M3 tonal palette + money semantic colors + Roboto / Noto Sans TC / Roboto Mono。

## 三、色彩使用規則

1. **主色（Primary `#1a73e8`）**：用於主要按鈕、強調、tab active、focus ring。
2. **Surface 階層**：`background` < `surface` < `surfaceContainer` < `surfaceContainerHigh`。卡片預設用 `surface` + `outline` 細邊。
3. **Money 三色**：
   - 收入綠 `#1b873f`
   - 支出紅 `#d32f2f`
   - 剩餘藍 `#1a73e8`（與 primary 同色）
   - 超支橘 `#b95000`
4. **大項分類色**：`categoryPalette` 提供 6 色，新建類別自動 hash 分配。

## 四、字型規則

- **正文**：Roboto + Noto Sans TC（思源黑體）
- **數字**：**一律** Roboto Mono，`tabular-nums` + `tnum` + 千分位
- **永遠不用** Tahoma / Verdana / Courier New（舊規範淘汰）

## 五、形狀與間距

- **圓角階層**：`xs 4` / `sm 8` / `md 16` / `lg 28` / `full`
  - 卡片：`md (16px)`
  - 按鈕：`full (pill)`
  - 輸入框：`xs (4px)`
  - 大型 hero card：`lg (28px)`
- **間距**：4px 為基礎單位，常用 8 / 12 / 16 / 20 / 24

## 六、Elevation

- M3 不大量用陰影，多用 surface tone 區隔。
- 預設卡片：`outline` 細邊，無陰影
- Elevated 卡片：`elevation-1`
- FAB / Modal：`elevation-2 ~ 3`

## 七、開發規則

1. 顏色一律使用語意化 tokens，**禁止硬寫 hex**。
2. 所有金額元素必須加 `.num` class（mono + tabular）。
3. 純數字輸入框 → 置中對齊。
4. 文字輸入框 → 左對齊但留 16px padding，文字不貼框。
5. 大項分類標籤必須有固定且可區分的色系（沿用舊規則）。
6. Hover / Focus / Active / Disabled 四態必備。
7. 先局部驗證，再擴散：先做 `/quick-entry` → `/`(Dashboard) → `/budget-usage` → `/budget-allocation`。
8. 同功能區塊內，按鈕、卡片、輸入框維持同一套視覺語言。

## 八、禁止事項

- 禁止使用任何金屬漸層、inset/outset border、emboss text shadow。
- 禁止用 emoji 取代圖示。
- 禁止省略 hover / focus 狀態。
- 禁止硬寫顏色（必須走 token）。
- 禁止把整站一次改完——一頁一頁驗證。

## 九、目前驗證範圍

- 已完成設計稿：Dashboard A / 快速記帳 A / 預算分配 A / 預算使用 A
- 設計稿檔案：`design/material3/Lite YNAB Material 3.html`
- 實作優先順序：`/quick-entry` → `/` → `/budget-usage` → `/budget-allocation`

## 十、變更記錄

- v2.0 (2026-05) — 全面改為 Material 3 淺色明亮風格
- v1.0 — Winamp 金屬鍍鉻擬物化（已淘汰，封存）
