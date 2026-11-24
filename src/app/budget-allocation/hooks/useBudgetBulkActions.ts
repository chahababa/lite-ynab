"use client";

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
  setPendingKey: SetPendingKey;
  setToast: SetToast;
  setConfirmDialog: SetState<ConfirmDialogState | null>;
};

/** Month-level actions: save income, copy last month's budgets, apply all fixed budgets. */
export function useBudgetBulkActions({
  supabase,
  monthId,
  incomeAmount,
  rows,
  setRows,
  previousReferenceMap,
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

  return { saveIncome, copyPreviousMonthBudgets, applyAutoBudgets };
}
