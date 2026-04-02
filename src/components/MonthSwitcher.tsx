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
    <div className="flex items-center justify-between rounded-[28px] bg-ink px-4 py-3 text-paper shadow-float">
      <button
        type="button"
        onClick={onPrevious}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-paper/60">Month</p>
        <p className="font-display text-2xl">{formatMonthLabel(monthId)}</p>
      </div>
      <button
        type="button"
        onClick={onNext}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
        aria-label="Next month"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
