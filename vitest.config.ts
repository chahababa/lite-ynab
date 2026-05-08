import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // @vitejs/plugin-react 強制 react-jsx automatic transform：
  // Next.js build 會把 tsconfig.json 的 jsx 設成 "preserve"，
  // 否則 vitest/rolldown 會在 .test.tsx 解析失敗。
  // 這個 plugin 讓 vitest 不依賴 tsconfig.json 的 jsx 值。
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/.claude/**", "**/node_modules/**"],
  },
});
