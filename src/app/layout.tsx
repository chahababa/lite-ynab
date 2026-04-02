import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Lite YNAB",
  description: "Mobile-first budgeting app with fast monthly planning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
