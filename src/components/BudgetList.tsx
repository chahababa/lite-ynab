"use client";

import { useEffect, useState } from "react";

import type { BudgetRow } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

type BudgetListProps = {
  items: BudgetRow[];
  onSave: (budgetId: string, value: number) => Promise<void>;
  pendingBudgetId: string | null;
};

export function BudgetList({
  items,
  onSave,
  pendingBudgetId,
}: BudgetListProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts(
      items.reduce<Record<string, string>>((accumulator, item) => {
        accumulator[item.budgetId] = item.allocated.toString();
        return accumulator;
      }, {}),
    );
  }, [items]);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const spentRatio =
          item.allocated > 0 ? Math.min(item.spent / item.allocated, 1) : item.spent > 0 ? 1 : 0;

        return (
          <div
            key={item.budgetId}
            className="rounded-[28px] border border-ink/10 bg-white/80 p-4 shadow-sm backdrop-blur"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-ink">{item.categoryName}</h3>
                  {item.isQuick ? (
                    <span className="rounded-full bg-sun/20 px-2 py-0.5 text-[11px] text-ink">
                      Quick
                    </span>
                  ) : null}
                  {item.isAuto ? (
                    <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[11px] text-mint">
                      Auto
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-ink/60">
                  已支出 {formatCurrency(item.spent)}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "font-display text-xl",
                    item.remaining < 0 ? "text-coral" : "text-ink",
                  )}
                >
                  {formatCurrency(item.remaining)}
                </p>
                {item.warning ? (
                  <p className="text-xs font-medium text-coral">{item.warning}</p>
                ) : (
                  <p className="text-xs text-ink/50">剩餘可用</p>
                )}
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/8">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  item.remaining < 0 ? "bg-coral" : "bg-mint",
                )}
                style={{ width: `${Math.max(spentRatio * 100, 6)}%` }}
              />
            </div>

            <div className="mt-4 flex items-end gap-3">
              <label className="flex-1">
                <span className="mb-1 block text-xs uppercase tracking-[0.22em] text-ink/45">
                  預算額度
                </span>
                <input
                  inputMode="numeric"
                  value={drafts[item.budgetId] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.budgetId]: event.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 outline-none ring-0 transition focus:border-mint"
                />
              </label>
              <button
                type="button"
                disabled={pendingBudgetId === item.budgetId}
                onClick={() => onSave(item.budgetId, Number(drafts[item.budgetId] ?? item.allocated))}
                className="rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingBudgetId === item.budgetId ? "儲存中" : "儲存"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
