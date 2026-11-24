import type { Metadata } from "next";
import "@fontsource-variable/roboto/wght.css";
import "@fontsource-variable/noto-sans-tc/wght.css";
import "@fontsource-variable/roboto-mono/wght.css";

import "@/app/globals.css";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Lite YNAB",
  description: "輕量化個人記帳與預算分配工具。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
