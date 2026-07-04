"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, PieChart, Plus, ReceiptText } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "主控臺", icon: Home, isPrimary: false },
  { href: "/budget-usage", label: "預算", icon: PieChart, isPrimary: false },
  { href: "/quick-entry", label: "記一筆", icon: Plus, isPrimary: true },
  { href: "/transactions", label: "交易", icon: ReceiptText, isPrimary: false },
  { href: "/reports", label: "報表", icon: BarChart3, isPrimary: false },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  // 只有登入頁不顯示導覽；快速記帳現在是首頁，必須有導覽列
  if (pathname === "/login") {
    return null;
  }

  return (
    <nav
      aria-label="主要導覽"
      className="fixed inset-x-0 bottom-0 z-[999] border-t border-outline-variant bg-surface pb-[env(safe-area-inset-bottom)] shadow-elev-2"
    >
      <div className="mx-auto grid h-16 w-full max-w-md grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          if (item.isPrimary) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className="flex items-center justify-center"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-on shadow-elev-2 transition-colors duration-m3-short hover:bg-primary/90 active:bg-primary/80">
                  <Icon className="h-6 w-6" />
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1",
                isActive ? "text-primary" : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-m3-short",
                  isActive && "bg-primary-container",
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
