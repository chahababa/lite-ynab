import { useState } from "react";

const NEU_BG = "#E0E5EC";
const SHADOW_DARK = "#A3B1C6";
const SHADOW_LIGHT = "#FFFFFF";
const PRIMARY = "#6C63FF";
const DANGER = "#FF6B6B";
const SUCCESS = "#00B894";
const TEXT = "#2D3436";
const TEXT_SEC = "#636E72";

const raised = `6px 6px 12px ${SHADOW_DARK}, -6px -6px 12px ${SHADOW_LIGHT}`;
const pressed = `inset 4px 4px 8px ${SHADOW_DARK}, inset -4px -4px 8px ${SHADOW_LIGHT}`;
const flat = `3px 3px 6px ${SHADOW_DARK}, -3px -3px 6px ${SHADOW_LIGHT}`;
const concave = `inset 2px 2px 5px ${SHADOW_DARK}, inset -2px -2px 5px ${SHADOW_LIGHT}`;

// === 按鈕元件 ===
function NeuButton({ children, color = PRIMARY, onClick }) {
  const [isPressed, setIsPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      style={{
        background: NEU_BG,
        border: "none",
        borderRadius: 12,
        padding: "12px 24px",
        fontSize: "0.9rem",
        fontWeight: 600,
        color: color,
        cursor: "pointer",
        boxShadow: isPressed ? pressed : raised,
        transform: isPressed ? "scale(0.97)" : "scale(1)",
        transition: "box-shadow 250ms cubic-bezier(0.25,0.1,0.25,1), transform 150ms ease",
      }}
    >
      {children}
    </button>
  );
}

// === 卡片元件 ===
function NeuCard({ children }) {
  return (
    <div
      style={{
        background: NEU_BG,
        borderRadius: 16,
        padding: 20,
        boxShadow: flat,
      }}
    >
      {children}
    </div>
  );
}

// === 輸入框元件 ===
function NeuInput({ placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      style={{
        background: NEU_BG,
        borderRadius: 12,
        padding: "12px 16px",
        boxShadow: focused
          ? `inset 3px 3px 6px ${SHADOW_DARK}, inset -3px -3px 6px ${SHADOW_LIGHT}, 0 0 0 2px ${PRIMARY}40`
          : concave,
        transition: "box-shadow 200ms ease-in-out",
      }}
    >
      <input
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          width: "100%",
          fontSize: "0.9rem",
          color: TEXT,
        }}
      />
    </div>
  );
}

// === Toggle 元件 ===
function NeuToggle({ label, active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: active ? PRIMARY : NEU_BG,
        color: active ? "#FFF" : TEXT_SEC,
        border: "none",
        borderRadius: 20,
        padding: "6px 14px",
        fontSize: "0.8rem",
        fontWeight: 500,
        cursor: "pointer",
        boxShadow: active ? pressed : flat,
        transition: "all 250ms cubic-bezier(0.25,0.1,0.25,1)",
      }}
    >
      {label}
    </button>
  );
}

// === 圓形按鈕（加減數量用） ===
function NeuCircleButton({ children, onClick }) {
  const [isPressed, setIsPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: NEU_BG,
        border: "none",
        fontSize: "1.1rem",
        fontWeight: 600,
        color: TEXT,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: isPressed ? pressed : raised,
        transform: isPressed ? "scale(0.95)" : "scale(1)",
        transition: "box-shadow 200ms ease, transform 150ms ease",
      }}
    >
      {children}
    </button>
  );
}
