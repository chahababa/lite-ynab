import type { Metadata } from "next";

import "@/app/globals.css";
import { PageQuickNav } from "@/components/PageQuickNav";

export const metadata: Metadata = {
  title: "Lite YNAB",
  description: "輕量化記帳、預算分配與報表分析工具。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        <PageQuickNav />
        {children}
      </body>
    </html>
  );
}
