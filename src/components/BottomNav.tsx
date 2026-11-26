"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, PieChart, Plus, ReceiptText, Settings } from "lucide-react";

import { useCtbcPendingCount } from "@/lib/useCtbcPendingCount";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Plus;
  isPrimary?: boolean;
  badge?: number;
};

const CTBC_INBOX_HREF = "/settings/email-import";

export function BottomNav() {
  const pathname = usePathname();
  // 換頁時重新讀取，確認完幾筆後數字會跟著更新
  const pendingCount = useCtbcPendingCount(pathname);
  return <BottomNavView pathname={pathname} pendingCount={pendingCount} />;
}

/** 只負責畫面：pendingCount 為 null 代表沒開中信收件匣。 */
export function BottomNavView({
  pathname,
  pendingCount,
}: {
  pathname: string;
  pendingCount: number | null;
}) {

  // 登入頁與公開的隱私權政策頁不顯示導覽；快速記帳現在是首頁，必須有導覽列
  if (pathname === "/login" || pathname === "/privacy") {
    return null;
  }

  // 有開中信收件匣時，「刷卡」固定放在導覽列，並補上「設定」讓記一筆維持在正中間
  const hasInbox = pendingCount !== null;
  const items: NavItem[] = [
    { href: "/month", label: "本月", icon: PieChart },
    ...(hasInbox
      ? [{ href: CTBC_INBOX_HREF, label: "刷卡", icon: CreditCard, badge: pendingCount }]
      : []),
    { href: "/quick-entry", label: "記一筆", icon: Plus, isPrimary: true },
    { href: "/transactions", label: "交易", icon: ReceiptText },
    ...(hasInbox ? [{ href: "/settings", label: "設定", icon: Settings }] : []),
  ];

  return (
    <nav
      aria-label="主要導覽"
      className="fixed inset-x-0 bottom-0 z-[999] border-t border-outline-variant bg-surface pb-[env(safe-area-inset-bottom)] shadow-elev-2"
    >
      <div
        className={cn(
          "mx-auto grid h-16 w-full max-w-md",
          hasInbox ? "grid-cols-5" : "grid-cols-3",
        )}
      >
        {items.map((item) => {
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

          const badge = item.badge && item.badge > 0 ? item.badge : null;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={badge ? `${item.label}，${badge} 筆待確認` : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1",
                isActive ? "text-primary" : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-m3-short",
                  isActive && "bg-primary-container",
                )}
              >
                <Icon className="h-5 w-5" />
                {badge ? (
                  <span className="absolute -top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-money-expense px-1 font-mono text-[11px] font-medium leading-none tabular-nums text-primary-on">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
