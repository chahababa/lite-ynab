# 核心組件實作範例

## Chrome Button（金屬按鈕）

```css
.chrome-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border: 1px outset #CCC;
  border-radius: 3px;
  cursor: pointer;
  background: linear-gradient(180deg, #D0D0D0 0%, #A8A8A8 50%, #B8B8B8 100%);
  font-family: 'Tahoma', 'Verdana', sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #2A2A2A;
  text-transform: uppercase;
  letter-spacing: 1px;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.3);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2);
  transition: all 50ms ease-out;
}

.chrome-btn:hover {
  background: linear-gradient(180deg, #E0E0E0 0%, #B8B8B8 50%, #C8C8C8 100%);
}

.chrome-btn:active {
  background: linear-gradient(180deg, #A0A0A0 0%, #909090 50%, #A0A0A0 100%);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.2);
  transform: translateY(1px);
}
```

## LED Display Panel（LED 顯示面板）

```css
.led-panel {
  background: #1A1A2E;
  border: 2px inset #555;
  border-radius: 2px;
  padding: 12px;
}

.led-panel__value {
  font-family: 'Courier New', 'Lucida Console', monospace;
  font-size: 28px;
  color: #00FF88;
  text-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
}
```

## Chrome Window Frame（金屬視窗框架）

```css
.chrome-window {
  background: linear-gradient(180deg, #C8C8C8 0%, #A0A0A0 3%, #D4D4D4 6%, #B8B8B8 50%, #A0A0A0 97%, #888888 100%);
  border-radius: 4px;
  border: 1px solid #666;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.5);
  padding: 6px;
}

.chrome-window__titlebar {
  background: linear-gradient(180deg, #B0B0B0 0%, #989898 50%, #A8A8A8 100%);
  border-radius: 3px;
  padding: 4px 8px;
}
```

## 設計原則速查表

| 效果 | 技法 |
|------|------|
| 凸起 | `border: 1px outset` + inset top-highlight + inset bottom-shadow |
| 凹陷 | `border: 2px inset` + 深色背景 |
| 文字浮凸 | `text-shadow: 0 1px 0 rgba(255,255,255,0.3)` |
| 按壓回饋 | 反轉漸層 + `translateY(1px)` + inset shadow 加深 |
| LED 發光 | `text-shadow: 0 0 8px` + 對應色的 50% alpha |
| 動畫速度 | 機械感 50~100ms，永遠不超過 200ms |
