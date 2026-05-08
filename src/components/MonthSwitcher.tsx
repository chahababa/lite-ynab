"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatMonthLabel } from "@/lib/utils";

type MonthSwitcherProps = {
  monthId: string;
  onPrevious: () => void;
  onNext: () => void;
};

export function MonthSwitcher({
  monthId,
  onPrevious,
  onNext,
}: MonthSwitcherProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-outline bg-surface px-3 py-2">
      <button
        type="button"
        onClick={onPrevious}
        aria-label="上一個月"
        className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition-colors duration-m3-short hover:bg-on-surface/5 active:bg-on-surface/10"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="text-center">
        <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
          月份
        </p>
        <p className="text-title-lg">{formatMonthLabel(monthId)}</p>
      </div>
      <button
        type="button"
        onClick={onNext}
        aria-label="下一個月"
        className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition-colors duration-m3-short hover:bg-on-surface/5 active:bg-on-surface/10"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
