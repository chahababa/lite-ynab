import type { Config } from "tailwindcss";

// =====================================================================
// v2.0+ Material 3 Light & Bright
// =====================================================================
// v1.0 的 chrome / neu / ink-paper-sun-mint legacy tokens 已在 v2.1 全面清理。
// 設計參考：design/DESIGN-SPEC.md、design/material3/Lite YNAB Material 3.html
// =====================================================================

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ---- M3 tonal palette ----
        primary: {
          DEFAULT: "#1a73e8",
          on: "#ffffff",
          container: "#e8f0fe",
          "on-container": "#001d35",
        },
        secondary: {
          DEFAULT: "#5b6470",
          container: "#dfe2eb",
          "on-container": "#181c22",
        },
        tertiary: {
          DEFAULT: "#735471",
          container: "#fdd8f8",
        },
        background: "#fafbfd",
        surface: {
          DEFAULT: "#ffffff",
          dim: "#f3f4f7",
          "container-lowest": "#ffffff",
          "container-low": "#f7f8fa",
          container: "#f1f3f6",
          "container-high": "#ebedf1",
          "container-highest": "#e5e7eb",
        },
        "on-surface": {
          DEFAULT: "#1a1c1e",
          variant: "#44474b",
        },
        outline: {
          DEFAULT: "#e8eaed",
          variant: "#c4c7cb",
        },
        // ---- Money semantic colors (M3) ----
        money: {
          income: "#1b873f",
          "income-container": "#d6f5dd",
          expense: "#d32f2f",
          "expense-container": "#fde7e7",
          remain: "#1a73e8",
          "remain-container": "#e8f0fe",
          warn: "#b95000",
          "warn-container": "#ffddc2",
        },
        // ---- Category fixed colors (M3) ----
        cat: {
          food: "#e8590c",
          transport: "#1a73e8",
          shop: "#7c4dff",
          home: "#1b873f",
          health: "#d81b60",
          fun: "#00838f",
        },
      },

      fontFamily: {
        // ---- M3 (uses next/font variables wired in src/app/layout.tsx) ----
        sans: [
          "var(--font-roboto)",
          "var(--font-noto-sans-tc)",
          "Source Han Sans TC",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-roboto-mono)",
          "JetBrains Mono",
          "Menlo",
          "monospace",
        ],
      },

      fontSize: {
        // ---- M3 type scale ----
        "label-sm": ["11px", { lineHeight: "16px", fontWeight: "500", letterSpacing: "0.04em" }],
        "label-md": ["12px", { lineHeight: "16px", fontWeight: "500", letterSpacing: "0.04em" }],
        "body-sm": ["12px", { lineHeight: "16px" }],
        "body-md": ["14px", { lineHeight: "20px" }],
        "body-lg": ["16px", { lineHeight: "24px" }],
        "title-sm": ["14px", { lineHeight: "20px", fontWeight: "500" }],
        "title-md": ["16px", { lineHeight: "24px", fontWeight: "500" }],
        "title-lg": ["22px", { lineHeight: "28px", fontWeight: "500" }],
        "headline-sm": ["24px", { lineHeight: "32px", fontWeight: "500" }],
        "headline-md": ["28px", { lineHeight: "36px", fontWeight: "500" }],
        "display-sm": ["36px", { lineHeight: "44px", fontWeight: "500" }],
        // ---- M3 number scale (use with font-mono) ----
        "num-hero": ["56px", { lineHeight: "64px", fontWeight: "500", letterSpacing: "-0.01em" }],
        "num-display": ["36px", { lineHeight: "44px", fontWeight: "500", letterSpacing: "-0.01em" }],
        "num-title": ["24px", { lineHeight: "32px", fontWeight: "500", letterSpacing: "-0.01em" }],
      },

      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "28px",
        full: "9999px",
      },

      boxShadow: {
        "elev-1": "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        "elev-2": "0 1px 2px rgba(16,24,40,0.06), 0 4px 8px rgba(16,24,40,0.08)",
        "elev-3": "0 4px 8px rgba(16,24,40,0.08), 0 12px 24px rgba(16,24,40,0.10)",
      },

      transitionDuration: {
        "m3-short": "150ms",
        "m3-medium": "250ms",
        "m3-long": "400ms",
      },

      transitionTimingFunction: {
        "m3-standard": "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
