"use client";

import { cn } from "@/lib/utils";

import type { EntryType } from "../types";

type EntryTypeToggleProps = {
  entryType: EntryType;
  handleEntryTypeChange: (type: EntryType) => void;
};

export function EntryTypeToggle({ entryType, handleEntryTypeChange }: EntryTypeToggleProps) {
  return (
    <div className="flex rounded-full bg-surface-container p-[3px]">
      {(
        [
          { key: "expense", label: "支出", color: "text-money-expense" },
          { key: "income", label: "收入", color: "text-money-income" },
          { key: "transfer", label: "轉帳", color: "text-on-surface" },
        ] as const
      ).map((t) => {
        const active = entryType === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => handleEntryTypeChange(t.key)}
            className={cn(
              "flex-1 h-8 rounded-full text-body-md font-medium transition-colors duration-m3-short",
              active
                ? cn("bg-surface shadow-elev-1", t.color)
                : "bg-transparent text-on-surface-variant",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
