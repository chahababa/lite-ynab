import type { Metadata } from "next";
import { Noto_Sans_TC, Roboto, Roboto_Mono } from "next/font/google";

import "@/app/globals.css";
import { BottomNav } from "@/components/BottomNav";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-tc",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto-mono",
  display: "swap",
});

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
    <html
      lang="zh-Hant"
      className={`${roboto.variable} ${notoSansTC.variable} ${robotoMono.variable}`}
    >
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
