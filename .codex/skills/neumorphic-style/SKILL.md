---
name: neumorphic-style
description: >
  當任務涉及 UI 元件建立、頁面排版、樣式修改、或任何前端視覺相關工作時，
  必須觸發此 Skill。包含 Neumorphism 設計風格的完整規範、陰影系統、
  色彩定義、元件狀態邏輯、以及 Tailwind className 對照表。
  不適用於純後端邏輯、API 路由、資料庫操作等非視覺任務。
---

# Neumorphism 設計風格規範

## 核心概念

Neumorphism（新擬物化）的視覺邏輯：
元件與背景**同色**，透過「左上亮光 + 右下暗影」的雙方向陰影製造凸起或凹陷的立體感。
不使用邊框（border），不使用傳統的懸浮陰影。

## 陰影系統（最重要，請嚴格遵守）

### 1. Raised 凸起（按鈕預設、可互動元件）
```css
box-shadow: 6px 6px 12px #A3B1C6, -6px -6px 12px #FFFFFF;
```
Tailwind: `shadow-neu-raised`

### 2. Pressed 凹陷（按鈕按下、Toggle 啟用）
```css
box-shadow: inset 4px 4px 8px #A3B1C6, inset -4px -4px 8px #FFFFFF;
```
Tailwind: `shadow-neu-pressed`

### 3. Flat 微凸（卡片、容器、大面積區塊）
```css
box-shadow: 3px 3px 6px #A3B1C6, -3px -3px 6px #FFFFFF;
```
Tailwind: `shadow-neu-flat`

### 4. Concave 淺凹（輸入框、搜尋列、進度條軌道）
```css
box-shadow: inset 2px 2px 5px #A3B1C6, inset -2px -2px 5px #FFFFFF;
```
Tailwind: `shadow-neu-concave`

## 色彩系統

| 用途 | 色碼 | Tailwind class |
|------|------|----------------|
| 背景（頁面 + 元件） | `#E0E5EC` | `bg-neu-bg` |
| 主色（CTA、重要操作） | `#6C63FF` | `text-neu-primary` / `bg-neu-primary` |
| 危險（刪除、取消） | `#FF6B6B` | `text-neu-secondary` / `bg-neu-secondary` |
| 成功 | `#00B894` | `text-neu-success` |
| 警告 | `#FDCB6E` | `text-neu-warning` |
| 主要文字 | `#2D3436` | `text-neu-text` |
| 次要文字 | `#636E72` | `text-neu-text-secondary` |
| 禁用文字 | `#B2BEC3` | `text-neu-text-disabled` |

品牌色只用在文字、小圖示、Toggle 填充。禁止大面積高飽和色塊。

## 圓角規範

| 元件 | 數值 | Tailwind class |
|------|------|----------------|
| 按鈕 | 12px | `rounded-neu` |
| 卡片 / 容器 | 16px | `rounded-neu-lg` |
| 大圓角區塊 | 24px | `rounded-neu-xl` |
| 圓形（頭像、圓按鈕） | 9999px | `rounded-full` |

## 互動狀態邏輯

### 按鈕
- 預設 → `shadow-neu-raised`
- active/pressed → `shadow-neu-pressed` + `scale(0.97)`
- disabled → `shadow-neu-flat` + `opacity-50` + `cursor-not-allowed`

### Toggle / Chip
- 關閉 → `shadow-neu-flat` + `text-neu-text-secondary`
- 開啟 → `shadow-neu-pressed` + `bg-neu-primary` + `text-white`

### 輸入框
- 預設 → `shadow-neu-concave`
- focus → 陰影加深 + `ring-2 ring-neu-primary/25`

### 卡片
- 預設 → `shadow-neu-flat` + `rounded-neu-lg`
- hover（若可點擊） → 陰影略微加大 + `translateY(-1px)`

**所有狀態切換加 transition：`transition-all duration-normal ease-neu`**

## 字型

| 用途 | 字型 | 字重 |
|------|------|------|
| 標題 | Noto Sans TC | 600-700 |
| 內文 | Inter + Noto Sans TC | 400-500 |
| 數字 / 價格 | JetBrains Mono | 600 |

## 參考檔案
- 設計代幣 JSON：`references/neumorphic-tokens.json`
- 元件範例程式碼：`references/neumorphic-demo.jsx`

## 禁止事項
1. ❌ 使用 `border` 區分元件
2. ❌ 使用 `#FFFFFF` 作為元件背景
3. ❌ 使用單方向懸浮陰影
4. ❌ 大面積高飽和色塊
5. ❌ 省略 transition 動畫
6. ❌ 使用 `box-shadow: none`
7. ❌ 混用其他設計系統預設樣式
