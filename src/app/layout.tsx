import type { Metadata } from "next";

import "@/app/globals.css";
import { PageQuickNav } from "@/components/PageQuickNav";

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
        <PageQuickNav />
        {children}
      </body>
    </html>
  );
}
