"use client";

import { useEffect, useMemo, useState } from "react";

import { getGroupTone } from "@/lib/groupTone";
import type { BudgetRow } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

type BudgetListProps = {
  items: BudgetRow[];
  onSave: (budgetId: string, value: number) => Promise<boolean>;
  pendingBudgetId: string | null;
};

export function BudgetList({ items, onSave, pendingBudgetId }: BudgetListProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts(
      items.reduce<Record<string, string>>((accumulator, item) => {
        accumulator[item.budgetId] = item.allocated.toString();
        return accumulator;
      }, {}),
    );
  }, [items]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, BudgetRow[]>();

    for (const item of items) {
      const existing = groups.get(item.categoryGroupName) ?? [];
      existing.push(item);
      groups.set(item.categoryGroupName, existing);
    }

    return Array.from(groups.entries());
  }, [items]);

  return (
    <div className="space-y-4">
      {groupedItems.map(([groupName, rows], groupIndex) => {
        const accent = getGroupTone(groupName, groupIndex);

        return (
          <section key={groupName} className="chrome-window p-[6px]">
            <div className="chrome-titlebar mb-chrome-md px-chrome-md py-chrome-sm">
              <span
                className={cn(
                  "inline-flex rounded-chrome-pill border px-3 py-1 font-chrome-heading text-chrome-xs font-bold uppercase tracking-chrome-wide",
                  accent.badge,
                )}
              >
                {groupName}
              </span>
            </div>

            <div className="space-y-3">
              {rows.map((item) => {
                const spentRatio =
                  item.allocated > 0 ? Math.min(item.spent / item.allocated, 1) : item.spent > 0 ? 1 : 0;

                return (
                  <div key={item.budgetId} className="chrome-window p-[6px]">
                    <div className="grid grid-cols-[1fr_120px] gap-3 px-chrome-md py-chrome-sm">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-chrome-heading text-chrome-base font-bold uppercase tracking-chrome-wide text-chrome-900">
                            {item.categoryName}
                          </h3>
                          {item.isQuick ? (
                            <span className="rounded-chrome-pill border border-warning-light bg-warning-dark px-2 py-0.5 font-chrome-heading text-chrome-xs font-bold uppercase tracking-chrome-wide text-white">
                              quick
                            </span>
                          ) : null}
                          {item.isAuto ? (
                            <span className="rounded-chrome-pill border border-success-light bg-success-dark px-2 py-0.5 font-chrome-heading text-chrome-xs font-bold uppercase tracking-chrome-wide text-white">
                              auto
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 font-chrome-mono text-chrome-sm text-chrome-700">
                          已支出 {formatCurrency(item.spent)}
                        </p>
                        {item.warning ? (
                          <p className="mt-2 text-chrome-xs font-bold uppercase tracking-chrome-wide text-danger-dark">
                            {item.warning}
                          </p>
                        ) : (
                          <p className="mt-2 text-chrome-xs font-bold uppercase tracking-chrome-wide text-chrome-700">
                            on track
                          </p>
                        )}
                      </div>

                      <div
                        className={cn(
                          "chrome-led-panel flex flex-col items-center justify-center border border-l-2 px-chrome-sm py-chrome-sm text-center",
                          accent.panel,
                        )}
                      >
                        <p className="chrome-led-label text-chrome-xs uppercase">remaining</p>
                        <p
                          className={cn(
                            "mt-1 font-chrome-mono text-chrome-lg",
                            item.remaining < 0 ? "text-danger-light" : "text-[var(--chrome-led-green)]",
                          )}
                        >
                          {formatCurrency(item.remaining)}
                        </p>
                      </div>
                    </div>

                    <div className="px-chrome-md">
                      <div className="h-[6px] overflow-hidden rounded-full bg-chrome-700/35">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            item.remaining < 0 ? "bg-danger" : "bg-success",
                          )}
                          style={{ width: `${Math.max(spentRatio * 100, 6)}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-end gap-3 px-chrome-md pb-chrome-md">
                      <label className="flex-1">
                        <span className="mb-1 block font-chrome-heading text-chrome-xs font-bold uppercase tracking-chrome-wide text-chrome-700">
                          本月預算
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
                          className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md text-center"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={pendingBudgetId === item.budgetId}
                        onClick={() =>
                          void onSave(item.budgetId, Number(drafts[item.budgetId] ?? item.allocated))
                        }
                        className="chrome-btn min-h-11 px-chrome-md py-chrome-md font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide disabled:cursor-not-allowed"
                      >
                        {pendingBudgetId === item.budgetId ? "saving" : "save"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
