"use client";

import { cn } from "@/lib/utils";

import type { SetState } from "../types";

type IncomeSummaryCardProps = {
  incomeAmount: string;
  setIncomeAmount: SetState<string>;
  saveIncome: () => Promise<void>;
  pendingKey: string | null;
  allocatedTotal: number;
  unallocated: number;
};

export function IncomeSummaryCard({
  incomeAmount,
  setIncomeAmount,
  saveIncome,
  pendingKey,
  allocatedTotal,
  unallocated,
}: IncomeSummaryCardProps) {
  return (
      <section className="sticky top-3 z-20 rounded-md border border-outline bg-surface p-4 shadow-elev-1 lg:static">
        <label className="block">
        <span className="mb-2 block text-label-md text-on-surface-variant">本月收入</span>
        <div className="flex items-end gap-2">
          <input
            inputMode="numeric"
            value={incomeAmount}
            onChange={(event) => setIncomeAmount(event.target.value.replace(/[^\d]/g, ""))}
            className="h-12 w-full rounded-xs border border-outline-variant bg-surface px-4 text-center font-mono text-body-lg text-on-surface tabular-nums outline-none focus:border-primary focus:border-2 focus:px-[15px]"
          />
          <button
            type="button"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-body-md font-medium text-primary-on transition-colors duration-m3-short hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40"
            onClick={() => void saveIncome()}
            disabled={pendingKey === "income"}
          >
            {pendingKey === "income" ? "儲存中" : "儲存"}
          </button>
        </div>
      </label>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-money-remain-container p-3">
          <p className="text-label-sm text-on-surface-variant">已分配</p>
          <p className="mt-1 font-mono text-num-title font-medium text-money-remain tabular-nums">
            ${allocatedTotal.toLocaleString("en-US")}
          </p>
        </div>
        <div
          className={cn(
            "rounded-md p-3",
            unallocated < 0
              ? "bg-money-expense-container"
              : "bg-surface-container",
          )}
        >
          <p className="text-label-sm text-on-surface-variant">剩餘可分配</p>
          <p
            className={cn(
              "mt-1 font-mono text-num-title font-medium tabular-nums",
              unallocated < 0 ? "text-money-expense" : "text-on-surface",
            )}
          >
            ${unallocated.toLocaleString("en-US")}
          </p>
        </div>
      </div>
    </section>
  );
}
