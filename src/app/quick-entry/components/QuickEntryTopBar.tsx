"use client";

import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";

import type { QuickBudgetStatus } from "@/lib/data";

type QuickEntryTopBarProps = {
  monthSummary: QuickBudgetStatus;
};

export function QuickEntryTopBar({ monthSummary }: QuickEntryTopBarProps) {
  const remaining = monthSummary.available - monthSummary.spent;
  const hasBudget = monthSummary.available > 0;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col pl-1">
        <p className="text-title-md">記一筆</p>
        {hasBudget ? (
          <Link
            href="/month"
            className="truncate font-mono text-label-md text-on-surface-variant hover:text-on-surface"
          >
            {remaining >= 0 ? (
              <>本月還能花 ${remaining.toLocaleString("en-US")}</>
            ) : (
              <span className="text-money-warn">
                本月超支 ${Math.abs(remaining).toLocaleString("en-US")}
              </span>
            )}
            {" / "}預算 ${monthSummary.available.toLocaleString("en-US")}
          </Link>
        ) : null}
      </div>
      <Link
        href="/settings"
        aria-label="設定"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
      >
        <SettingsIcon className="h-5 w-5" />
      </Link>
    </div>
  );
}
