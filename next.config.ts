import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 主控臺與預算使用兩頁已合併成「本月」；舊網址（書籤、主畫面捷徑）導到新頁。
  async redirects() {
    return [
      { source: "/dashboard", destination: "/month", permanent: false },
      { source: "/budget-usage", destination: "/month", permanent: false },
    ];
  },
};

export default nextConfig;
