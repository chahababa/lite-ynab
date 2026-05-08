"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  title?: ReactNode;
  /** 左側 leading（通常是返回 / 關閉 icon button）。 */
  leading?: ReactNode;
  /** 右側 actions（一個或多個 icon button / button）。 */
  actions?: ReactNode;
  className?: string;
  /** Center-aligned title (M3 default for small/medium app bar)。預設 true。 */
  centered?: boolean;
};

/**
 * M3 Top App Bar — 高 64px，背景 surface，內距 px-4，標題置中。
 */
export function AppBar({
  title,
  leading,
  actions,
  className,
  centered = true,
}: Props) {
  return (
    <header
      className={cn(
        "flex items-center h-16 px-4 bg-surface text-on-surface",
        className,
      )}
    >
      <div className="flex items-center min-w-[40px]">{leading}</div>
      <div
        className={cn(
          "flex-1 text-title-md text-on-surface",
          centered ? "text-center" : "text-left pl-2",
        )}
      >
        {title}
      </div>
      <div className="flex items-center gap-1 min-w-[40px] justify-end">
        {actions}
      </div>
    </header>
  );
}
