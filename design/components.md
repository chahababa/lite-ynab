# 核心元件實作｜Material 3

## 元件對照表（舊 chrome → 新 M3）

| 舊元件 | 新元件 | 主要 className |
|--------|--------|----------------|
| Chrome Button | M3 Button (Filled / Tonal / Outlined / Text) | `m3-btn m3-btn-{filled\|tonal\|outlined\|text}` |
| LED Display Panel | Money Display | `num num-{income\|expense\|remain\|warn}` |
| Chrome Window Frame | M3 Card (Outlined / Elevated / Filled) | `m3-card / m3-card-elevated / m3-card-filled` |
| Chrome TitleBar | Top App Bar | `m3-appbar` |
| — | Chip | `m3-chip` |
| — | FAB / Extended FAB | `m3-fab / m3-fab-extended` |
| — | Progress | `m3-progress > .m3-progress-bar` |
| — | Text Field | `m3-field > .m3-field-label + .m3-field-input` |

## Card

```css
.m3-card {
  background: var(--md-surface);
  border: 1px solid var(--md-outline);
  border-radius: 16px;
  padding: 20px;
}
.m3-card-elevated {
  background: var(--md-surface);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--elev-1);
}
.m3-card-filled {
  background: var(--md-surface-container);
  border-radius: 16px;
  padding: 20px;
}
```

## Button

```css
.m3-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 24px;
  border: none; border-radius: 9999px;
  font-family: var(--font-sans); font-size: 14px; font-weight: 500;
  cursor: pointer; transition: all 150ms cubic-bezier(0.2,0,0,1);
}
.m3-btn-filled   { background: var(--md-primary); color: var(--md-on-primary); }
.m3-btn-tonal    { background: var(--md-primary-container); color: var(--md-on-primary-container); }
.m3-btn-outlined { background: transparent; color: var(--md-primary); border: 1px solid var(--md-outline-variant); }
.m3-btn-text     { background: transparent; color: var(--md-primary); padding: 0 12px; }
```

## Money Display（最重要）

```css
.num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  letter-spacing: -0.01em;
}
.num-income  { color: var(--money-income); }
.num-expense { color: var(--money-expense); }
.num-remain  { color: var(--money-remain); }
.num-warn    { color: var(--money-warn); }
```

**字級階層**（在卡片中使用）：
- Hero 餘額：`56px / 500`
- 主要金額（單筆 / 卡片頂部）：`36px / 500`
- 次要金額（清單 row）：`16~20px / 500`
- 註解金額（/ $8,000）：`12px / 400`

## Chip

```css
.m3-chip {
  display: inline-flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 12px;
  border: 1px solid var(--md-outline-variant);
  border-radius: 8px; background: transparent;
  font-size: 13px; cursor: pointer;
}
.m3-chip[data-selected="true"] {
  background: var(--md-secondary-container);
  border-color: transparent;
  color: var(--md-on-secondary-container);
}
```

## Text Field

```css
.m3-field-input {
  height: 48px; padding: 0 16px;
  border: 1px solid var(--md-outline-variant);
  border-radius: 4px; background: var(--md-surface);
  font-size: 16px; outline: none;
}
.m3-field-input.num { text-align: center; font-family: var(--font-mono); font-size: 18px; }
.m3-field-input:focus { border-color: var(--md-primary); border-width: 2px; padding: 0 15px; }
```

## Progress

```css
.m3-progress {
  position: relative; height: 8px;
  background: var(--md-surface-container-high);
  border-radius: 9999px; overflow: hidden;
}
.m3-progress-bar {
  height: 100%;
  background: var(--md-primary);
  border-radius: 9999px;
  transition: width 250ms cubic-bezier(0.2,0,0,1);
}
```

## 設計原則速查

| 想做的 | 怎麼做 |
|---|---|
| 顯示金額 | 加 `.num` + 對應顏色 class |
| 區隔卡片層次 | 改 `surface` → `surfaceContainer` → `surfaceContainerHigh` |
| 強調主要操作 | `m3-btn-filled` |
| 次要操作 | `m3-btn-tonal` 或 `m3-btn-outlined` |
| 濾鏡 / 標籤 | `m3-chip` + `data-selected` |
| 提示警告卡 | `m3-card` + 背景換 `money.warnContainer` |
| 超支類別 | `num-expense` + 紅色 progress bar |

## 動畫規則

- 一律使用 `cubic-bezier(0.2, 0, 0, 1)` (M3 Standard)
- 短：150ms（hover、focus、small ui）
- 中：250ms（progress bar、layout shift）
- 長：400ms（modal、page transition）
- **永遠不要超過 400ms**
