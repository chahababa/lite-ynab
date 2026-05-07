import type { Config } from "tailwindcss";

// =====================================================================
// v2.0 Material 3 Light & Bright + v1.0 legacy chrome (transition state)
// =====================================================================
// - 新代碼一律走 M3 命名空間（primary, surface, money, cat, ...）
// - 舊頁面繼續使用 chrome-* / neu-* / success-* / ... 直到逐頁遷移
// - 舊 v1.0 的 primary（深藍 #1A1A2E）僅給 groupTone 用，已搬到 legacy.primary
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

        // ---- v1.0 legacy (groupTone primary preset 仍引用) ----
        legacy: {
          primary: {
            DEFAULT: "#1A1A2E",
            light: "#2A2A4E",
          },
        },

        // ---- v1.0 chrome system (各頁面尚未遷移時繼續使用) ----
        ink: "#14213d",
        paper: "#fbf7ef",
        sun: "#fca311",
        mint: "#2a9d8f",
        coral: "#e76f51",
        sand: "#e9c46a",
        chrome: {
          50: "#E0E0E0",
          100: "#D4D4D4",
          200: "#C8C8C8",
          300: "#B8B8B8",
          400: "#A8A8A8",
          500: "#A0A0A0",
          600: "#888888",
          700: "#707070",
          800: "#555555",
          900: "#2A2A2A",
          highlight: "rgba(255, 255, 255, 0.4)",
          shadow: "rgba(0, 0, 0, 0.2)",
        },
        success: {
          DEFAULT: "#339966",
          light: "#44BB77",
          dark: "#228855",
        },
        danger: {
          DEFAULT: "#BB5533",
          light: "#CC6644",
          dark: "#AA4422",
        },
        warning: {
          DEFAULT: "#CC9933",
          light: "#DDAA44",
          dark: "#AA7722",
        },
        info: {
          DEFAULT: "#4488BB",
          light: "#5599CC",
          dark: "#336699",
        },
        led: {
          green: "#00FF88",
          amber: "#FFAA00",
          red: "#FF4444",
          muted: "#44CC77",
        },
        panel: {
          dark: "#1A1A2E",
        },
        neu: {
          bg: "#E0E5EC",
          primary: "#6C63FF",
          "primary-muted": "#8B85FF",
          secondary: "#FF6B6B",
          success: "#00B894",
          danger: "#E17055",
          warning: "#FDCB6E",
          text: "#2D3436",
          "text-secondary": "#636E72",
          "text-disabled": "#B2BEC3",
          "shadow-light": "#FFFFFF",
          "shadow-dark": "#A3B1C6",
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
        // ---- v1.0 legacy ----
        display: ["var(--font-space-grotesk)"],
        body: ["var(--font-noto-sans-tc)"],
        "chrome-heading": ["Tahoma", "Verdana", "sans-serif"],
        "chrome-body": ["Tahoma", "Verdana", "sans-serif"],
        "chrome-mono": ['"Courier New"', '"Lucida Console"', "monospace"],
        "chrome-led": ['"Courier New"', '"Lucida Console"', "monospace"],
        heading: ["'Noto Sans TC'", "'SF Pro Display'", "sans-serif"],
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
        // ---- v1.0 chrome ----
        "chrome-xs": ["0.875rem", { lineHeight: "1.3" }],
        "chrome-sm": ["1rem", { lineHeight: "1.4" }],
        "chrome-base": ["1.125rem", { lineHeight: "1.5" }],
        "chrome-lg": ["1.25rem", { lineHeight: "1.4" }],
        "chrome-xl": ["1.25rem", { lineHeight: "1.3" }],
        "chrome-2xl": ["1.5rem", { lineHeight: "1.3" }],
        "chrome-led": ["1.75rem", { lineHeight: "1.2" }],
      },

      letterSpacing: {
        "chrome-wide": "1px",
        "chrome-wider": "1.5px",
        "chrome-widest": "2px",
      },

      borderRadius: {
        // ---- M3 ----
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "28px",
        full: "9999px",
        // ---- v1.0 ----
        "chrome-btn": "3px",
        "chrome-card": "4px",
        "chrome-input": "2px",
        "chrome-pill": "12px",
        neu: "12px",
        "neu-lg": "16px",
        "neu-xl": "24px",
      },

      boxShadow: {
        // ---- M3 elevation ----
        "elev-1": "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        "elev-2": "0 1px 2px rgba(16,24,40,0.06), 0 4px 8px rgba(16,24,40,0.08)",
        "elev-3": "0 4px 8px rgba(16,24,40,0.08), 0 12px 24px rgba(16,24,40,0.10)",
        // ---- v1.0 ----
        float: "0 20px 60px rgba(20, 33, 61, 0.14)",
        "chrome-sm":
          "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)",
        "chrome-md":
          "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.3)",
        "chrome-lg":
          "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.5)",
        "chrome-pressed":
          "inset 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.2)",
        "led-glow": "0 0 8px rgba(0,255,136,0.5)",
        "led-glow-amber": "0 0 8px rgba(255,170,0,0.4)",
        "neu-raised": "6px 6px 12px #A3B1C6, -6px -6px 12px #FFFFFF",
        "neu-pressed": "inset 4px 4px 8px #A3B1C6, inset -4px -4px 8px #FFFFFF",
        "neu-flat": "3px 3px 6px #A3B1C6, -3px -3px 6px #FFFFFF",
        "neu-concave": "inset 2px 2px 5px #A3B1C6, inset -2px -2px 5px #FFFFFF",
      },

      backgroundImage: {
        "chrome-panel":
          "linear-gradient(180deg, #C8C8C8 0%, #A0A0A0 3%, #D4D4D4 6%, #B8B8B8 50%, #A0A0A0 97%, #888888 100%)",
        "chrome-button":
          "linear-gradient(180deg, #D0D0D0 0%, #A8A8A8 50%, #B8B8B8 100%)",
        "chrome-button-hover":
          "linear-gradient(180deg, #E0E0E0 0%, #B8B8B8 50%, #C8C8C8 100%)",
        "chrome-button-active":
          "linear-gradient(180deg, #A0A0A0 0%, #909090 50%, #A0A0A0 100%)",
        "chrome-titlebar":
          "linear-gradient(180deg, #B0B0B0 0%, #989898 50%, #A8A8A8 100%)",
        "chrome-statusbar":
          "linear-gradient(180deg, #A0A0A0 0%, #888888 100%)",
        "btn-success":
          "linear-gradient(180deg, #44BB77 0%, #228855 50%, #339966 100%)",
        "btn-danger":
          "linear-gradient(180deg, #CC6644 0%, #AA4422 50%, #BB5533 100%)",
        "led-progress": "linear-gradient(90deg, #00CC66, #00FF88)",
      },

      transitionDuration: {
        // ---- M3 ----
        "m3-short": "150ms",
        "m3-medium": "250ms",
        "m3-long": "400ms",
        // ---- v1.0 ----
        instant: "50ms",
        click: "100ms",
        fast: "150ms",
        normal: "250ms",
        slow: "400ms",
      },

      transitionTimingFunction: {
        // ---- M3 ----
        "m3-standard": "cubic-bezier(0.2, 0, 0, 1)",
        // ---- v1.0 ----
        mechanical: "linear",
        click: "cubic-bezier(0.25, 0, 0.5, 1)",
        "metal-bounce": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        neu: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        "neu-out": "cubic-bezier(0, 0, 0.2, 1)",
        "neu-smooth": "cubic-bezier(0.45, 0, 0.55, 1)",
      },

      spacing: {
        "chrome-xs": "2px",
        "chrome-sm": "4px",
        "chrome-md": "8px",
        "chrome-lg": "12px",
        "chrome-xl": "16px",
        "chrome-2xl": "24px",
      },
    },
  },
  plugins: [],
};

export default config;
