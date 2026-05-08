"use client";

import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type CardVariant = "outlined" | "elevated" | "filled";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
};

const VARIANT_CLASS: Record<CardVariant, string> = {
  outlined: "bg-surface border border-outline",
  elevated: "bg-surface shadow-elev-1",
  filled: "bg-surface-container",
};

/**
 * M3 Card — 三種 variant 對應 components.md。
 * 預設 padding 20，圓角 md (16px)。
 */
export function Card({ variant = "outlined", className, ...rest }: Props) {
  return (
    <div
      className={cn("rounded-md p-5", VARIANT_CLASS[variant], className)}
      {...rest}
    />
  );
}
