"use client";

import type { InputHTMLAttributes } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: string;
  /** 純數字輸入框置中、用 mono；文字輸入框左對齊。預設 false。 */
  numeric?: boolean;
  /** Helper / error text 顯示在 input 下方。 */
  helperText?: string;
  /** 觸發 error 樣式（紅邊 + helperText 變紅）。 */
  error?: boolean;
};

/**
 * M3 Text Field（filled / outlined 取捨：用 outlined 風格更貼近 lite-ynab）。
 * height 48, padding 0 16, rounded xs.
 * 純數字 → 置中 + mono。
 */
export function TextField({
  label,
  numeric = false,
  helperText,
  error = false,
  className,
  id,
  ...rest
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = `${inputId}-helper`;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label ? (
        <label
          htmlFor={inputId}
          className="text-label-md text-on-surface-variant"
        >
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-describedby={helperText ? helperId : undefined}
        aria-invalid={error || undefined}
        className={cn(
          "h-12 px-4 bg-surface text-on-surface border rounded-xs outline-none",
          "transition-colors duration-m3-short ease-m3-standard",
          "focus:border-primary focus:border-2 focus:px-[15px]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          error
            ? "border-money-expense"
            : "border-outline-variant hover:border-on-surface",
          numeric
            ? "text-center font-mono text-body-lg [font-feature-settings:'tnum'] tabular-nums"
            : "text-body-lg text-left",
        )}
        {...rest}
      />
      {helperText ? (
        <span
          id={helperId}
          className={cn(
            "text-label-md",
            error ? "text-money-expense" : "text-on-surface-variant",
          )}
        >
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
