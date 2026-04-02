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
        sun: "#fca311",
        mint: "#2a9d8f",
        coral: "#e76f51",
        sand: "#e9c46a",
      },
      boxShadow: {
        float: "0 20px 60px rgba(20, 33, 61, 0.14)",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)"],
        body: ["var(--font-noto-sans-tc)"],
      },
    },
  },
  plugins: [],
};

export default config;
