"use client";

import { createElement } from "react";

import { SUGGESTION_MONTHS, type BudgetSuggestion } from "@/lib/budgetSuggestion";
import type { BudgetRow } from "@/lib/types";

import { getErrorMessage } from "../helpers";
import type {
  ConfirmDialogState,
  PreviousReference,
  SetPendingKey,
  SetState,
  SetToast,
  SupabaseBrowserClient,
} from "../types";

type UseBudgetBulkActionsArgs = {
  supabase: SupabaseBrowserClient;
  monthId: string;
  incomeAmount: string;
  rows: BudgetRow[];
  setRows: SetState<BudgetRow[]>;
  previousReferenceMap: Record<string, PreviousReference>;
  suggestionMap: Record<string, BudgetSuggestion>;
  setPendingKey: SetPendingKey;
  setToast: SetToast;
  setConfirmDialog: SetState<ConfirmDialogState | null>;
};

/** Month-level actions: save income, copy last month's budgets, apply fixed or suggested budgets. */
export function useBudgetBulkActions({
  supabase,
  monthId,
  incomeAmount,
  rows,
  setRows,
  previousReferenceMap,
  suggestionMap,
  setPendingKey,
  setToast,
  setConfirmDialog,
}: UseBudgetBulkActionsArgs) {
  async function saveIncome() {
    setPendingKey("income");

    try {
      const { error } = await supabase.from("monthly_incomes").upsert(
        {
          month_id: monthId,
          amount: Number(incomeAmount || 0),
        },
        { onConflict: "user_id,month_id" },
      );

      if (error) {
        throw error;
      }

      setToast({ tone: "success", message: "本月收入已儲存。" });
    } catch (error) {
      setToast({ tone: "error", message: `儲存本月收入失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function copyPreviousMonthBudgets(confirmed = false) {
    if (!confirmed) {
      setConfirmDialog({
        title: "複製上月預算",
        description: "會用上個月的預算配置覆蓋本月目前金額，建議先確認目前未完成輸入。",
        confirmLabel: "套用上月預算",
        onConfirm: () => copyPreviousMonthBudgets(true),
      });
      return;
    }

    setPendingKey("copy");

    try {
      const nextRows = rows.map((row) => {
        const previous = previousReferenceMap[row.categoryId];
        const nextAllocated = previous?.allocated ?? 0;
        return {
          ...row,
          allocated: nextAllocated,
          remaining: nextAllocated + row.carryover - row.spent,
        };
      });

      const responses = await Promise.all(
        nextRows.map((row) =>
          supabase.from("budgets").update({ allocated: row.allocated }).eq("id", row.budgetId),
        ),
      );
      const failed = responses.find((item) => item.error);
      if (failed?.error) {
        throw failed.error;
      }

      setRows(nextRows);
      setToast({ tone: "success", message: "已套用上個月的預算配置。" });
    } catch (error) {
      setToast({ tone: "error", message: `複製上月預算失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function applyAutoBudgets(confirmed = false) {
    const autoRows = rows.filter((row) => row.isAuto && row.autoAmount > 0);
    if (autoRows.length === 0) {
      setToast({ tone: "info", message: "目前沒有可套用的固定預算。" });
      return;
    }

    if (!confirmed) {
      setConfirmDialog({
        title: "批次套用固定預算",
        description: `會將 ${autoRows.length} 個固定預算一次套用到本月。`,
        confirmLabel: "套用固定預算",
        onConfirm: () => applyAutoBudgets(true),
      });
      return;
    }

    setPendingKey("auto-all");

    try {
      const nextRows = rows.map((row) =>
        row.isAuto && row.autoAmount > 0
          ? {
              ...row,
              allocated: row.autoAmount,
              remaining: row.autoAmount + row.carryover - row.spent,
            }
          : row,
      );

      const responses = await Promise.all(
        nextRows.map((row) =>
          supabase.from("budgets").update({ allocated: row.allocated }).eq("id", row.budgetId),
        ),
      );
      const failed = responses.find((item) => item.error);
      if (failed?.error) {
        throw failed.error;
      }

      setRows(nextRows);
      setToast({ tone: "success", message: `已套用 ${autoRows.length} 個固定預算。` });
    } catch (error) {
      setToast({ tone: "error", message: `批次套用固定預算失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  // 只動「有建議、而且建議金額跟目前不同」的小項；沒有建議的小項維持原樣。
  async function applySuggestedBudgets(confirmed = false) {
    const changes = rows
      .map((row) => ({ row, suggestion: suggestionMap[row.categoryId] }))
      .filter(
        (item): item is { row: BudgetRow; suggestion: BudgetSuggestion } =>
          Boolean(item.suggestion) && item.suggestion.suggested !== item.row.allocated,
      );

    if (changes.length === 0) {
      setToast({ tone: "info", message: "目前沒有可套用的建議：近三個月的紀錄不足，或預算已經跟建議一樣。" });
      return;
    }

    if (!confirmed) {
      const before = changes.reduce((sum, item) => sum + item.row.allocated, 0);
      const after = changes.reduce((sum, item) => sum + item.suggestion.suggested, 0);

      setConfirmDialog({
        title: "套用建議預算",
        description: createElement(
          "div",
          { className: "space-y-3" },
          createElement(
            "p",
            null,
            `依近 ${SUGGESTION_MONTHS} 個月通常的花費調整 ${changes.length} 個小項，合計 $${before.toLocaleString("en-US")} → $${after.toLocaleString("en-US")}。其他小項不會變動。`,
          ),
          createElement(
            "ul",
            { className: "max-h-56 space-y-1 overflow-y-auto text-body-sm" },
            changes.map((item) =>
              createElement(
                "li",
                { key: item.row.budgetId, className: "flex items-baseline justify-between gap-3" },
                createElement("span", { className: "min-w-0 break-words" }, item.row.categoryName),
                createElement(
                  "span",
                  { className: "shrink-0 font-mono tabular-nums" },
                  `$${item.row.allocated.toLocaleString("en-US")} → $${item.suggestion.suggested.toLocaleString("en-US")}`,
                ),
              ),
            ),
          ),
        ),
        confirmLabel: "套用建議預算",
        onConfirm: () => applySuggestedBudgets(true),
      });
      return;
    }

    setPendingKey("suggest-all");

    try {
      const responses = await Promise.all(
        changes.map((item) =>
          supabase.from("budgets").update({ allocated: item.suggestion.suggested }).eq("id", item.row.budgetId),
        ),
      );
      const failed = responses.find((item) => item.error);
      if (failed?.error) {
        throw failed.error;
      }

      const nextAllocated = new Map(changes.map((item) => [item.row.budgetId, item.suggestion.suggested]));
      setRows((current) =>
        current.map((row) => {
          const allocated = nextAllocated.get(row.budgetId);
          return allocated === undefined
            ? row
            : { ...row, allocated, remaining: allocated + row.carryover - row.spent };
        }),
      );
      setToast({ tone: "success", message: `已依建議調整 ${changes.length} 個小項的預算。` });
    } catch (error) {
      setToast({ tone: "error", message: `套用建議預算失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  return { saveIncome, copyPreviousMonthBudgets, applyAutoBudgets, applySuggestedBudgets };
}
