"use client";

import { cn } from "@/lib/utils";

export type MoneyType = "income" | "expense" | "remain" | "warn" | "neutral";
export type MoneySize = "hero" | "display" | "title" | "body" | "caption";

type Props = {
  /** 金額數值（整數或小數）。lite-ynab 目前只用整數，但保留 decimals 給未來擴充。 */
  value: number;
  /** 語意類型決定顏色，預設 neutral（on-surface 黑）。 */
  type?: MoneyType;
  /** 字級階層，預設 body（16px）。 */
  size?: MoneySize;
  /** 顯示前綴：income 預設 +、expense 預設 −、其他無。傳 false 強制不顯示，傳 string 自訂。 */
  prefix?: false | string;
  /** 是否顯示貨幣符號 $（TWD）。預設 true。 */
  showCurrency?: boolean;
  className?: string;
  /** 整數顯示位數（千分位內建）。 */
  decimals?: number;
};

const SIZE_CLASS: Record<MoneySize, string> = {
  hero: "text-num-hero",
  display: "text-num-display",
  title: "text-num-title",
  body: "text-body-lg font-medium",
  caption: "text-body-sm",
};

const TYPE_CLASS: Record<MoneyType, string> = {
  income: "text-money-income",
  expense: "text-money-expense",
  remain: "text-money-remain",
  warn: "text-money-warn",
  neutral: "text-on-surface",
};

function getDefaultPrefix(type: MoneyType): string {
  if (type === "income") return "+";
  if (type === "expense") return "−"; // U+2212 minus, not hyphen
  return "";
}

export function MoneyText({
  value,
  type = "neutral",
  size = "body",
  prefix,
  showCurrency = true,
  className,
  decimals = 0,
}: Props) {
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(absValue);

  const resolvedPrefix =
    prefix === false ? "" : (prefix ?? getDefaultPrefix(type));
  const currency = showCurrency ? "$" : "";

  return (
    <span
      className={cn(
        "font-mono tabular-nums [font-feature-settings:'tnum'] [letter-spacing:-0.01em]",
        SIZE_CLASS[size],
        TYPE_CLASS[type],
        className,
      )}
    >
      {resolvedPrefix}
      {currency}
      {formatted}
    </span>
  );
}
