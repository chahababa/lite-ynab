"use client";

import { cn } from "@/lib/utils";

type EntryFieldChipProps = {
  label: string;
  onClick: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function EntryFieldChip({
  label,
  onClick,
  ariaLabel,
  disabled = false,
  className,
}: EntryFieldChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className={cn(
        "inline-flex items-center gap-1 rounded-chrome-pill border border-chrome-700 bg-chrome-100 px-3 py-1 font-chrome-body text-chrome-sm text-chrome-900 transition-colors duration-fast ease-click",
        "hover:bg-chrome-50 active:bg-chrome-200",
        "disabled:cursor-not-allowed disabled:bg-chrome-200 disabled:text-chrome-600",
        className,
      )}
    >
      {label}
    </button>
  );
}
