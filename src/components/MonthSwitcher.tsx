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
    <div className="chrome-window p-[6px]">
      <div className="chrome-titlebar flex items-center justify-between gap-3 px-chrome-md py-chrome-sm text-chrome-900">
        <button
          type="button"
          onClick={onPrevious}
          className="chrome-btn flex h-11 w-11 items-center justify-center"
          aria-label="上一個月"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="font-chrome-heading text-chrome-xs font-bold tracking-chrome-wider text-chrome-800">
            月份
          </p>
          <p className="font-chrome-heading text-chrome-2xl font-bold tracking-chrome-wide">
            {formatMonthLabel(monthId)}
          </p>
        </div>
        <button
          type="button"
          onClick={onNext}
          className="chrome-btn flex h-11 w-11 items-center justify-center"
          aria-label="下一個月"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
