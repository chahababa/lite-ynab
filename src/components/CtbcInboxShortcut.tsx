"use client";

import Link from "next/link";
import { ChevronRight, CreditCard } from "lucide-react";

import type { CtbcAutoImported } from "@/lib/ctbcAutoRules";
import { useCtbcAutoImported, useCtbcPendingCount } from "@/lib/useCtbcPendingCount";

/**
 * 頁面最上方的「刷卡待確認」提醒。
 * 有待確認的刷卡才出現，用醒目的底色；沒有時不佔位置（設定頁可用 showWhenEmpty 保留入口）。
 */
export function CtbcInboxShortcut({ showWhenEmpty = false }: { showWhenEmpty?: boolean }) {
  const count = useCtbcPendingCount();
  const autoImported = useCtbcAutoImported();
  if (count === null) return null;
  return (
    <>
      <CtbcAutoImportedNotice imported={autoImported} />
      <CtbcInboxCard count={count} showWhenEmpty={showWhenEmpty} />
    </>
  );
}

/** 「已自動記帳 N 筆」的小提示：讓你知道哪些刷卡沒問你就記進去了。 */
export function CtbcAutoImportedNotice({ imported }: { imported: CtbcAutoImported[] }) {
  if (imported.length === 0) return null;
  const total = imported.reduce((sum, item) => sum + item.amount, 0);
  const shown = imported.slice(0, 3);

  return (
    <Link
      href="/settings/email-import"
      className="flex items-center gap-3 rounded-md border border-outline bg-surface px-4 py-2.5 transition-colors duration-m3-short hover:bg-on-surface/5 active:bg-on-surface/10"
    >
      <CreditCard className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-body-md font-medium text-on-surface">
          已自動記帳 <span className="font-mono tabular-nums">{imported.length}</span> 筆，共{" "}
          <span className="font-mono tabular-nums">{"$"}{total.toLocaleString("en-US")}</span>
        </span>
        <span className="block truncate text-body-sm text-on-surface-variant">
          {shown.map((item) => `${item.merchant} ${"$"}${item.amount.toLocaleString("en-US")}`).join("、")}
          {imported.length > shown.length ? " …" : ""}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-on-surface-variant" />
    </Link>
  );
}

/** 只負責畫面：給定待確認筆數就畫出提醒。 */
export function CtbcInboxCard({
  count,
  showWhenEmpty = false,
}: {
  count: number;
  showWhenEmpty?: boolean;
}) {

  if (count === 0) {
    if (!showWhenEmpty) return null;
    return (
      <Link
        href="/settings/email-import"
        className="flex items-center gap-3 rounded-md border border-outline bg-surface px-4 py-3 transition-colors duration-m3-short hover:bg-on-surface/5 active:bg-on-surface/10"
      >
        <CreditCard className="h-5 w-5 shrink-0 text-on-surface-variant" />
        <span className="min-w-0 flex-1">
          <span className="block text-title-sm text-on-surface">刷卡待確認</span>
          <span className="block text-body-sm text-on-surface-variant">目前沒有待確認的刷卡</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-on-surface-variant" />
      </Link>
    );
  }

  return (
    <Link
      href="/settings/email-import"
      className="flex items-center gap-3 rounded-md bg-money-warn-container px-4 py-3 transition-opacity duration-m3-short hover:opacity-90 active:opacity-80"
    >
      <CreditCard className="h-6 w-6 shrink-0 text-money-warn" />
      <span className="min-w-0 flex-1">
        <span className="block text-title-md text-on-surface">
          有 <span className="font-mono tabular-nums">{count}</span> 筆刷卡待確認
        </span>
        <span className="block text-body-sm text-on-surface-variant">
          確認後才會記進帳裡
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-money-warn px-3 py-1.5 text-label-md text-primary-on">
        去確認
      </span>
    </Link>
  );
}
