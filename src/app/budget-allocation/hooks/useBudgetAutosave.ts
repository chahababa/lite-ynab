"use client";

import { useEffect, useRef } from "react";

import { buildAutoBudgetAdjustmentReminder } from "@/lib/autoBudgetLearning";
import type { BudgetRow } from "@/lib/types";

import { getErrorMessage } from "../helpers";
import type { SetPendingKey, SetToast, SupabaseBrowserClient } from "../types";

type UseBudgetAutosaveArgs = {
  supabase: SupabaseBrowserClient;
  setPendingKey: SetPendingKey;
  setToast: SetToast;
};

/** Debounced (500ms) autosave of 本月預算 / 固定預算 inputs, plus timer cleanup on unmount. */
export function useBudgetAutosave({ supabase, setPendingKey, setToast }: UseBudgetAutosaveArgs) {
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  async function saveBudgetValue(row: BudgetRow, allocated: number) {
    setPendingKey(row.budgetId);

    try {
      const { error } = await supabase.from("budgets").update({ allocated }).eq("id", row.budgetId);

      if (error) {
        throw error;
      }

      const reminder = buildAutoBudgetAdjustmentReminder({
        categoryName: row.categoryName,
        isAuto: row.isAuto,
        autoAmount: row.autoAmount,
        allocated,
      });

      setToast({
        tone: reminder ? "info" : "success",
        message: reminder ?? `${row.categoryName} 的本月預算已自動儲存。`,
      });
    } catch (error) {
      setToast({ tone: "error", message: `儲存預算失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  function scheduleBudgetSave(row: BudgetRow, allocated: number) {
    const currentTimer = saveTimersRef.current[row.budgetId];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }

    saveTimersRef.current[row.budgetId] = setTimeout(() => {
      void saveBudgetValue(row, allocated);
      delete saveTimersRef.current[row.budgetId];
    }, 500);
  }

  async function saveAutoBudgetValue(categoryId: string, categoryName: string, autoAmount: number) {
    setPendingKey(`auto-${categoryId}`);

    try {
      const nextAutoAmount = Math.max(0, autoAmount);
      const nextIsAuto = nextAutoAmount > 0;
      const { error } = await supabase
        .from("categories")
        .update({
          is_auto: nextIsAuto,
          auto_amount: nextAutoAmount,
        })
        .eq("id", categoryId);

      if (error) {
        throw error;
      }

      setToast({
        tone: "success",
        message: nextIsAuto
          ? `${categoryName} 的固定預算已自動儲存。`
          : `${categoryName} 的固定預算已清除。`,
      });
    } catch (error) {
      setToast({ tone: "error", message: `儲存固定預算失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  function scheduleAutoBudgetSave(categoryId: string, categoryName: string, autoAmount: number) {
    const timerKey = `auto-${categoryId}`;
    const currentTimer = saveTimersRef.current[timerKey];
    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    saveTimersRef.current[timerKey] = setTimeout(() => {
      void saveAutoBudgetValue(categoryId, categoryName, autoAmount);
      delete saveTimersRef.current[timerKey];
    }, 500);
  }

  return { scheduleBudgetSave, scheduleAutoBudgetSave };
}
