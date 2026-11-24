"use client";

import { CalendarDays } from "lucide-react";

import { getTodayInTaipei } from "@/lib/utils";

import { shiftTaipeiDate } from "../helpers";

type DateSheetProps = {
  applyDate: (nextDate: string, modified: boolean) => void;
  applyCustomDate: () => void;
  customDateInput: string;
  setCustomDateInput: (value: string) => void;
  setIsDateSheetOpen: (open: boolean) => void;
};

export function DateSheet({
  applyDate,
  applyCustomDate,
  customDateInput,
  setCustomDateInput,
  setIsDateSheetOpen,
}: DateSheetProps) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-scrim/40 px-3 pb-3" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="選擇日期" className="w-full max-w-md rounded-t-[28px] bg-surface p-4 shadow-elev-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" />
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h2 className="text-title-md">選擇記帳日期</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "今天", value: getTodayInTaipei(), modified: false },
            { label: "昨天", value: shiftTaipeiDate(getTodayInTaipei(), 1), modified: true },
            { label: "前天", value: shiftTaipeiDate(getTodayInTaipei(), 2), modified: true },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => applyDate(option.value, option.modified)}
              className="rounded-md border border-outline bg-surface-container px-3 py-3 text-body-md text-on-surface hover:bg-on-surface/[0.03] active:bg-on-surface/[0.06]"
            >
              <span className="block font-medium">{option.label}</span>
              <span className="mt-1 block text-label-sm text-on-surface-variant">{option.value}</span>
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-label-md text-on-surface-variant">自訂日期</span>
          <input
            value={customDateInput}
            onChange={(event) => setCustomDateInput(event.target.value)}
            placeholder="YYYY-MM-DD"
            className="h-11 w-full rounded-xs border border-outline-variant bg-surface px-3 text-center font-mono text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setIsDateSheetOpen(false)} className="h-10 rounded-full px-4 text-body-md font-medium text-primary hover:bg-primary/5 active:bg-primary/10">
            取消
          </button>
          <button type="button" onClick={applyCustomDate} className="h-10 rounded-full bg-primary px-5 text-body-md font-medium text-primary-on hover:bg-primary/90 active:bg-primary/80">
            套用
          </button>
        </div>
      </div>
    </div>
  );
}
