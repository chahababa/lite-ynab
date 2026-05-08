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
        "inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface px-3 py-1 font-sans text-body-sm text-on-surface transition-colors duration-m3-short ease-m3-standard",
        "hover:bg-on-surface/5 active:bg-on-surface/10",
        "disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface-variant disabled:opacity-60",
        className,
      )}
    >
      {label}
    </button>
  );
}
