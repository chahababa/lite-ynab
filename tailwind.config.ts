import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#14213d",
        paper: "#fbf7ef",
        sun: "#fca311",h
        mint: "#2a9d8f",
        coral: "#e76f51",
        sand: "#e9c46a",
        primary: {
          DEFAULT: "#1A1A2E",
          light: "#2A2A4E",
        },
        chrome: {
          50: "#E0E0E0",
          100: "#D4D4D4",
          200: "#C8C8C8",
          300: "#B8B8B8",
          400: "#A8A8A8",
          500: "#A0A0A0",
          600: "#888888",
          700: "#707070",hh
          800: "#555555",
          900: "#2A2A2A",
          highlight: "rgba(255, 255, 255, 0.4)",
          shadow: "rgba(0, 0, 0, 0.2)",
        },
        surface: {
          DEFAULT: "#C0C0C0",
          raised: "#D0D0D0",
          pressed: "#A0A0A0",
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
      boxShadow: {
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
      fontFamily: {
        display: ["var(--font-space-grotesk)"],
        body: ["var(--font-noto-sans-tc)"],
        "chrome-heading": ["Tahoma", "Verdana", "sans-serif"],
        "chrome-body": ["Tahoma", "Verdana", "sans-serif"],
        "chrome-mono": ['"Courier New"', '"Lucida Console"', "monospace"],
        "chrome-led": ['"Courier New"', '"Lucida Console"', "monospace"],
        heading: ["'Noto Sans TC'", "'SF Pro Display'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      fontSize: {
        "chrome-xs": ["0.875rem", { lineHeight: "1.3" }],     // 12px (badge)
        "chrome-sm": ["1rem", { lineHeight: "1.4" }],    // 14px (labels, descriptions)
        "chrome-base": ["1.125rem", { lineHeight: "1.5" }],      // 16px (body, buttons, inputs)
        "chrome-lg": ["1.25rem", { lineHeight: "1.4" }],    // 18px (emphasis)
        "chrome-xl": ["1.25rem", { lineHeight: "1.3" }],     // 20px (page titles)
        "chrome-2xl": ["1.5rem", { lineHeight: "1.3" }],     // 24px (big titles)
        "chrome-led": ["1.75rem", { lineHeight: "1.2" }],
      },
      letterSpacing: {
        "chrome-wide": "1px",
        "chrome-wider": "1.5px",
        "chrome-widest": "2px",
      },
      borderRadius: {
        "chrome-btn": "3px",
        "chrome-card": "4px",
        "chrome-input": "2px",
        "chrome-pill": "12px",
        neu: "12px",
        "neu-lg": "16px",
        "neu-xl": "24px",
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
// test       "btn-success":
          "linear-gradient(180deg, #44BB77 0%, #228855 50%, #339966 100%)",
        "btn-danger":
          "linear-gradient(180deg, #CC6644 0%, #AA4422 50%, #BB5533 100%)",
        "led-progress": "linear-gradient(90deg, #00CC66, #00FF88)",
      },
      transitionDuration: {
        instant: "50ms",
        click: "100ms",
        fast: "150ms",
        normal: "250ms",
        slow: "400ms",
      },
      transitionTimingFunction: {
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
