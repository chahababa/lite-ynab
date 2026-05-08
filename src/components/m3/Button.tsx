"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
};

const BASE =
  "inline-flex items-center justify-center gap-2 h-10 rounded-full font-sans text-body-md font-medium " +
  "transition-colors duration-m3-short ease-m3-standard " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  filled:
    "bg-primary text-primary-on hover:bg-primary/90 active:bg-primary/80 px-6",
  tonal:
    "bg-primary-container text-primary-on-container hover:bg-primary-container/80 active:bg-primary-container/70 px-6",
  outlined:
    "bg-transparent text-primary border border-outline-variant hover:bg-primary/5 active:bg-primary/10 px-6",
  text: "bg-transparent text-primary hover:bg-primary/5 active:bg-primary/10 px-3",
};

export function Button({
  variant = "filled",
  className,
  startIcon,
  endIcon,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={cn(BASE, VARIANT_CLASS[variant], className)}
      {...rest}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
}
