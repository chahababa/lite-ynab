"use client";

import { cn } from "@/lib/utils";

type Props = {
  /** 0–100 (or > 100 for over-budget). */
  value: number;
  /** 超支時切到 expense 紅色（M3 設計稿規範）。 */
  variant?: "primary" | "expense" | "warn" | "income";
  className?: string;
  /** 視覺最大值，超過會被 clamp（但 over-budget 顏色判斷用 raw value）。 */
  max?: number;
  /** 自訂 a11y label。 */
  ariaLabel?: string;
};

const VARIANT_CLASS = {
  primary: "bg-primary",
  expense: "bg-money-expense",
  warn: "bg-money-warn",
  income: "bg-money-income",
} as const;

export function Progress({
  value,
  variant = "primary",
  className,
  max = 100,
  ariaLabel,
}: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={ariaLabel}
      className={cn(
        "relative h-2 bg-surface-container-high rounded-full overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-m3-medium ease-m3-standard",
          VARIANT_CLASS[variant],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
