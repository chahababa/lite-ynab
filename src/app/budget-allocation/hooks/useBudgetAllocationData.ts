"use client";

import { useEffect, useMemo, useState } from "react";
import type { useRouter } from "next/navigation";

import { fetchBudgetAllocationData, fetchBudgetReferenceData } from "@/lib/data";
import type { BudgetRow, PaymentMethodOption } from "@/lib/types";
import { getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

import { getErrorMessage } from "../helpers";
import type { CompactGroup, PreviousReference, SetToast, SupabaseBrowserClient } from "../types";

type UseBudgetAllocationDataArgs = {
  supabase: SupabaseBrowserClient;
  router: ReturnType<typeof useRouter>;
  setToast: SetToast;
};

/** Month selection, auth guard, loading of the month's budget data and the derived totals. */
export function useBudgetAllocationData({ supabase, router, setToast }: UseBudgetAllocationDataArgs) {
  const [monthId, setMonthId] = useState(() => toMonthId(getTodayInTaipei()));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [incomeAmount, setIncomeAmount] = useState("0");
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [previousReferenceMap, setPreviousReferenceMap] = useState<Record<string, PreviousReference>>({});

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const previousMonthId = shiftMonth(monthId, -1);
        const [currentData, previousReferences] = await Promise.all([
          fetchBudgetAllocationData(supabase, monthId),
          fetchBudgetReferenceData(supabase, previousMonthId),
        ]);

        if (!active) {
          return;
        }

        const nextReferenceMap = previousReferences.reduce<Record<string, PreviousReference>>(
          (accumulator, row) => {
            accumulator[row.categoryId] = {
              allocated: row.allocated,
              spent: row.spent,
            };
            return accumulator;
          },
          {},
        );

        setIncomeAmount(String(currentData.income?.amount ?? 0));
        setRows(currentData.budgetRows);
        setPaymentMethods(currentData.paymentMethods);
        setPreviousReferenceMap(nextReferenceMap);
      } catch (error) {
        if (!active) {
          return;
        }

        const message =
          error instanceof Error && error.message === "AUTH_REQUIRED"
            ? "請先登入，才能查看預算分配。"
            : `載入預算分配失敗：${getErrorMessage(error)}`;

        setLoadError(message);
        setToast({ tone: "error", message });

        if (error instanceof Error && error.message === "AUTH_REQUIRED") {
          router.replace("/login");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [monthId, refreshTick, router, setToast, supabase]);

  const groupedRows = useMemo<CompactGroup[]>(() => {
    const grouped = new Map<string, CompactGroup>();

    rows.forEach((row) => {
      const current = grouped.get(row.categoryGroupId);

      if (current) {
        current.rows.push(row);
        return;
      }

      grouped.set(row.categoryGroupId, {
        groupId: row.categoryGroupId,
        groupName: row.categoryGroupName,
        rows: [row],
      });
    });

    return Array.from(grouped.values());
  }, [rows]);

  const allocatedTotal = useMemo(() => rows.reduce((sum, row) => sum + row.allocated, 0), [rows]);
  const unallocated = useMemo(() => Number(incomeAmount || 0) - allocatedTotal, [incomeAmount, allocatedTotal]);

  async function reload() {
    setRefreshTick((value) => value + 1);
  }

  return {
    monthId,
    setMonthId,
    loading,
    loadError,
    incomeAmount,
    setIncomeAmount,
    rows,
    setRows,
    paymentMethods,
    setPaymentMethods,
    previousReferenceMap,
    groupedRows,
    allocatedTotal,
    unallocated,
    reload,
  };
}
