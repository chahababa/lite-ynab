"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
};

/**
 * M3 Chip — height 32, rounded sm (8), border outline-variant.
 * Selected 狀態用 secondary-container 填色。
 */
export function Chip({
  selected = false,
  className,
  startIcon,
  endIcon,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      data-selected={selected}
      className={cn(
        "inline-flex items-center gap-2 h-8 px-3 rounded-sm border text-body-sm font-medium",
        "transition-colors duration-m3-short ease-m3-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        "disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "bg-secondary-container text-secondary-on-container border-transparent"
          : "bg-transparent text-on-surface border-outline-variant hover:bg-on-surface/5 active:bg-on-surface/10",
        className,
      )}
      {...rest}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
}
