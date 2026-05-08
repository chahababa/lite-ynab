"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type FabSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: FabSize;
  /** Extended FAB：圓角 lg 而非完全圓，含文字 + icon。 */
  extended?: boolean;
  icon?: ReactNode;
};

const SIZE_CLASS: Record<FabSize, string> = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-24 w-24",
};

export function Fab({
  size = "md",
  extended = false,
  icon,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center bg-primary-container text-primary-on-container shadow-elev-2",
        "transition-all duration-m3-short ease-m3-standard",
        "hover:shadow-elev-3 active:shadow-elev-1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-40",
        extended
          ? "h-14 px-5 gap-2 rounded-md text-body-md font-medium"
          : cn(SIZE_CLASS[size], "rounded-md"),
        className,
      )}
      {...rest}
    >
      {icon}
      {extended ? children : null}
    </button>
  );
}
