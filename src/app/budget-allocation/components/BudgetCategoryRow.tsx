"use client";

import { Settings } from "lucide-react";

import type { BudgetRow } from "@/lib/types";

import type { CategoryRowHandlers, PreviousReference } from "../types";

type BudgetCategoryRowProps = CategoryRowHandlers & {
  row: BudgetRow;
  previous: PreviousReference;
  pendingKey: string | null;
};

export function BudgetCategoryRow({
  row,
  previous,
  pendingKey,
  openMenuId,
  setOpenMenuId,
  setRows,
  toggleQuickEntry,
  renameCategory,
  deleteCategory,
  scheduleAutoBudgetSave,
  scheduleBudgetSave,
}: BudgetCategoryRowProps) {
  return (
    <div
      className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,0.72fr)_minmax(0,0.72fr)_minmax(0,0.82fr)_minmax(0,0.82fr)] items-center gap-2 rounded-sm bg-surface-container-low px-2 py-2"
    >
      <div className="min-w-0 pl-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words text-body-md font-medium text-on-surface">
            {row.categoryName}
          </p>
          <div className="relative shrink-0">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/5 active:bg-on-surface/10"
              aria-label={`${row.categoryName} 設定`}
              onClick={() => setOpenMenuId((current) => (current === row.categoryId ? null : row.categoryId))}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            {openMenuId === row.categoryId ? (
              <div className="absolute right-0 z-20 mt-2 w-40 rounded-md border border-outline bg-surface p-1 shadow-elev-2">
                <button
                  type="button"
                  className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-on-surface hover:bg-on-surface/5 disabled:opacity-40"
                  onClick={() => void toggleQuickEntry(row)}
                  disabled={pendingKey === `quick-${row.categoryId}`}
                >
                  {row.isQuick ? "移出快速記帳" : "加入快速記帳"}
                </button>
                <button
                  type="button"
                  className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-on-surface hover:bg-on-surface/5 disabled:opacity-40"
                  onClick={() => void renameCategory(row)}
                  disabled={pendingKey === `rename-${row.categoryId}`}
                >
                  重新命名
                </button>
                <button
                  type="button"
                  className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-money-expense hover:bg-money-expense/5 disabled:opacity-40"
                  onClick={() => void deleteCategory(row)}
                  disabled={pendingKey === `delete-${row.categoryId}`}
                >
                  {pendingKey === `delete-${row.categoryId}` ? "刪除中" : "刪除該項目"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <p className="text-label-sm text-on-surface-variant">
          已支出 ${row.spent.toLocaleString("en-US")}
        </p>
        {row.carryover > 0 ? (
          <p className="text-label-sm text-on-surface-variant">
            含上月結轉 ${row.carryover.toLocaleString("en-US")}
          </p>
        ) : null}
        {pendingKey === row.budgetId ? (
          <p className="text-label-sm text-primary">自動儲存中...</p>
        ) : null}
        {pendingKey === `quick-${row.categoryId}` ? (
          <p className="text-label-sm text-primary">更新快速記帳中...</p>
        ) : null}
        {pendingKey === `auto-${row.categoryId}` ? (
          <p className="text-label-sm text-primary">儲存固定預算中...</p>
        ) : null}
        {pendingKey === `delete-${row.categoryId}` ? (
          <p className="text-label-sm text-money-expense">刪除中...</p>
        ) : null}
      </div>

      <div className="text-center font-mono text-body-sm tabular-nums text-on-surface-variant">
        ${previous.allocated.toLocaleString("en-US")}
      </div>
      <div className="text-center font-mono text-body-sm tabular-nums text-on-surface-variant">
        ${previous.spent.toLocaleString("en-US")}
      </div>

      <input
        inputMode="numeric"
        aria-label={`${row.categoryGroupName} ${row.categoryName} 固定預算`}
        value={String(row.autoAmount)}
        onChange={(event) => {
          const nextValue = Number(event.target.value.replace(/[^\d]/g, "") || 0);
          setRows((current) =>
            current.map((item) =>
              item.categoryId === row.categoryId
                ? { ...item, autoAmount: nextValue, isAuto: nextValue > 0 }
                : item,
            ),
          );
          scheduleAutoBudgetSave(row.categoryId, row.categoryName, nextValue);
        }}
        className="h-9 w-full rounded-xs border border-outline-variant bg-surface px-2 text-center font-mono text-body-md tabular-nums text-on-surface outline-none focus:border-primary focus:border-2"
      />

      <input
        inputMode="numeric"
        aria-label={`${row.categoryGroupName} ${row.categoryName} 本月預算`}
        value={String(row.allocated)}
        onChange={(event) => {
          const nextValue = Number(event.target.value.replace(/[^\d]/g, "") || 0);
          setRows((current) =>
            current.map((item) =>
              item.budgetId === row.budgetId
                ? {
                    ...item,
                    allocated: nextValue,
                    remaining: nextValue + item.carryover - item.spent,
                  }
                : item,
            ),
          );
          scheduleBudgetSave(row, nextValue);
        }}
        className="h-9 w-full rounded-xs border border-outline-variant bg-surface px-2 text-center font-mono text-body-md tabular-nums text-on-surface outline-none focus:border-primary focus:border-2"
      />
    </div>
  );
}
