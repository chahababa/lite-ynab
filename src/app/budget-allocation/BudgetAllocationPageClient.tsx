"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Settings } from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { fetchBudgetAllocationData, fetchBudgetReferenceData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { BudgetRow, PaymentMethodOption, ToastState } from "@/lib/types";
import { cn, formatCurrency, formatMonthLabel, getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

type CompactGroup = {
  groupId: string;
  groupName: string;
  rows: BudgetRow[];
};

type PreviousReference = {
  allocated: number;
  spent: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "發生未預期的錯誤";
}

export default function BudgetAllocationCompactPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [monthId, setMonthId] = useState(() => toMonthId(getTodayInTaipei()));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [incomeAmount, setIncomeAmount] = useState("0");
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [previousReferenceMap, setPreviousReferenceMap] = useState<Record<string, PreviousReference>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openGroupMenuId, setOpenGroupMenuId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [newPaymentMethodName, setNewPaymentMethodName] = useState("");

  useEffect(() => {
    const timer = toast ? window.setTimeout(() => setToast(null), 2600) : undefined;
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [toast]);

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

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
            ? "請先登入，才能查看預算分配試作版。"
            : `載入預算分配試作版失敗：${getErrorMessage(error)}`;

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
  }, [monthId, refreshTick, router, supabase]);

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

  async function saveBudgetValue(budgetId: string, categoryName: string, allocated: number) {
    setPendingKey(budgetId);

    try {
      const { error } = await supabase.from("budgets").update({ allocated }).eq("id", budgetId);

      if (error) {
        throw error;
      }

      setToast({ tone: "success", message: `${categoryName} 的本月預算已自動儲存。` });
    } catch (error) {
      setToast({ tone: "error", message: `儲存預算失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  function scheduleBudgetSave(budgetId: string, categoryName: string, allocated: number) {
    const currentTimer = saveTimersRef.current[budgetId];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }

    saveTimersRef.current[budgetId] = setTimeout(() => {
      void saveBudgetValue(budgetId, categoryName, allocated);
      delete saveTimersRef.current[budgetId];
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

  async function toggleQuickEntry(row: BudgetRow) {
    setPendingKey(`quick-${row.categoryId}`);

    try {
      const nextQuick = !row.isQuick;
      const { error } = await supabase.from("categories").update({ is_quick: nextQuick }).eq("id", row.categoryId);

      if (error) {
        throw error;
      }

      setRows((current) =>
        current.map((item) => (item.categoryId === row.categoryId ? { ...item, isQuick: nextQuick } : item)),
      );
      setOpenMenuId(null);
      setToast({
        tone: "success",
        message: nextQuick ? `${row.categoryName} 已加入快速記帳。` : `${row.categoryName} 已從快速記帳移除。`,
      });
    } catch (error) {
      setToast({ tone: "error", message: `更新快速記帳失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function renameCategory(row: BudgetRow) {
    const nextName = window.prompt("請輸入新的小項名稱", row.categoryName)?.trim();
    if (!nextName || nextName === row.categoryName) {
      return;
    }

    setPendingKey(`rename-${row.categoryId}`);

    try {
      const { error } = await supabase.from("categories").update({ name: nextName }).eq("id", row.categoryId);

      if (error) {
        throw error;
      }

      setRows((current) =>
        current.map((item) => (item.categoryId === row.categoryId ? { ...item, categoryName: nextName } : item)),
      );
      setOpenMenuId(null);
      setToast({ tone: "success", message: `已將小項名稱更新為「${nextName}」。` });
    } catch (error) {
      setToast({ tone: "error", message: `重新命名失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteCategory(row: BudgetRow) {
    const confirmed = window.confirm(
      `要刪除「${row.categoryName}」嗎？\n\n這會一起刪除這個小項的本月預算與相關交易紀錄，且無法復原。`,
    );

    if (!confirmed) {
      return;
    }

    setPendingKey(`delete-${row.categoryId}`);

    try {
      const { error } = await supabase.from("categories").delete().eq("id", row.categoryId);

      if (error) {
        throw error;
      }

      setRows((current) => current.filter((item) => item.categoryId !== row.categoryId));
      setOpenMenuId(null);
      setToast({
        tone: "success",
        message: `已刪除小項「${row.categoryName}」，上方已分配與剩餘可分配會同步回補。`,
      });
    } catch (error) {
      setToast({ tone: "error", message: `刪除小項失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function addCategoryToGroup(group: CompactGroup) {
    const nextName = window.prompt(`請輸入要新增到「${group.groupName}」的大項下小項名稱`)?.trim();
    if (!nextName) {
      return;
    }

    setPendingKey(`add-${group.groupId}`);

    try {
      const nextSortOrder =
        group.rows.reduce((max, row, index) => Math.max(max, (index + 1) * 10), 0) + 10;
      const categoryResult = await supabase
        .from("categories")
        .insert({
          category_group_id: group.groupId,
          name: nextName,
          is_auto: false,
          auto_amount: 0,
          is_quick: false,
          sort_order: nextSortOrder,
        })
        .select("id")
        .single();

      if (categoryResult.error || !categoryResult.data) {
        throw categoryResult.error ?? new Error("新增分類失敗");
      }

      const budgetResult = await supabase
        .from("budgets")
        .insert({
          month_id: monthId,
          category_id: categoryResult.data.id,
          allocated: 0,
        })
        .select("id")
        .single();

      if (budgetResult.error || !budgetResult.data) {
        throw budgetResult.error ?? new Error("新增預算失敗");
      }

      setRows((current) => [
        ...current,
        {
          budgetId: budgetResult.data.id,
          categoryId: categoryResult.data.id,
          categoryGroupId: group.groupId,
          categoryGroupName: group.groupName,
          categoryName: nextName,
          allocated: 0,
          spent: 0,
          remaining: 0,
          isQuick: false,
          isAuto: false,
          autoAmount: 0,
          warning: null,
        },
      ]);
      setToast({ tone: "success", message: `已在「${group.groupName}」新增小項「${nextName}」。` });
    } catch (error) {
      setToast({ tone: "error", message: `新增小項失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  async function renameGroup(group: CompactGroup) {
    const nextName = window.prompt("請輸入新的大項名稱", group.groupName)?.trim();
    if (!nextName || nextName === group.groupName) {
      return;
    }

    setPendingKey(`group-rename-${group.groupId}`);

    try {
      const { error } = await supabase.from("category_groups").update({ name: nextName }).eq("id", group.groupId);
      if (error) {
        throw error;
      }

      setRows((current) =>
        current.map((item) =>
          item.categoryGroupId === group.groupId ? { ...item, categoryGroupName: nextName } : item,
        ),
      );
      setToast({ tone: "success", message: `已將大項更新為「${nextName}」。` });
    } catch (error) {
      setToast({ tone: "error", message: `重新命名大項失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function reorderGroups(groupId: string, direction: -1 | 1) {
    const groups = groupedRows;
    const currentIndex = groups.findIndex((group) => group.groupId === groupId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= groups.length) {
      return;
    }

    setPendingKey(`group-sort-${groupId}`);

    try {
      const nextGroups = [...groups];
      const [moved] = nextGroups.splice(currentIndex, 1);
      nextGroups.splice(targetIndex, 0, moved);

      const nextRows = nextGroups.flatMap((group) =>
        rows.filter((row) => row.categoryGroupId === group.groupId),
      );

      const updates = nextGroups.map((group, index) =>
        supabase.from("category_groups").update({ sort_order: (index + 1) * 10 }).eq("id", group.groupId),
      );
      const responses = await Promise.all(updates);
      const failed = responses.find((item) => item.error);
      if (failed?.error) {
        throw failed.error;
      }

      setRows(nextRows);
      setToast({ tone: "success", message: "已更新大項排序。" });
    } catch (error) {
      setToast({ tone: "error", message: `更新大項排序失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteGroup(group: CompactGroup) {
    const confirmed = window.confirm(
      `要刪除大項「${group.groupName}」嗎？\n\n這會一起刪除底下 ${group.rows.length} 個小項、相關預算與交易資料，且無法復原。`,
    );
    if (!confirmed) {
      return;
    }

    setPendingKey(`group-delete-${group.groupId}`);

    try {
      const { error } = await supabase.from("category_groups").delete().eq("id", group.groupId);
      if (error) {
        throw error;
      }

      setRows((current) => current.filter((item) => item.categoryGroupId !== group.groupId));
      setToast({
        tone: "success",
        message: `已刪除大項「${group.groupName}」，相關小項、預算與交易也已移除。`,
      });
    } catch (error) {
      setToast({ tone: "error", message: `刪除大項失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function addPaymentMethod() {
    const nextName = newPaymentMethodName.trim();
    if (!nextName) {
      return;
    }

    setPendingKey("payment-add");

    try {
      const nextSortOrder =
        paymentMethods.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10;
      const result = await supabase
        .from("payment_methods")
        .insert({
          name: nextName,
          sort_order: nextSortOrder,
        })
        .select("id,name,sort_order")
        .single();

      if (result.error || !result.data) {
        throw result.error ?? new Error("新增支付方式失敗");
      }

      setPaymentMethods((current) => [
        ...current,
        {
          id: result.data.id,
          name: result.data.name,
          sortOrder: result.data.sort_order,
        },
      ]);
      setNewPaymentMethodName("");
      setToast({ tone: "success", message: `已新增支付方式「${nextName}」。` });
    } catch (error) {
      setToast({ tone: "error", message: `新增支付方式失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function renamePaymentMethod(method: PaymentMethodOption) {
    const nextName = window.prompt("請輸入新的支付方式名稱", method.name)?.trim();
    if (!nextName || nextName === method.name) {
      return;
    }

    setPendingKey(`payment-rename-${method.id}`);

    try {
      const { error } = await supabase.from("payment_methods").update({ name: nextName }).eq("id", method.id);
      if (error) {
        throw error;
      }

      setPaymentMethods((current) =>
        current.map((item) => (item.id === method.id ? { ...item, name: nextName } : item)),
      );
      setToast({ tone: "success", message: `已將支付方式更新為「${nextName}」。` });
    } catch (error) {
      setToast({ tone: "error", message: `重新命名支付方式失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function deletePaymentMethod(method: PaymentMethodOption) {
    const confirmed = window.confirm(`要刪除支付方式「${method.name}」嗎？如果仍有交易使用它，系統會阻擋刪除。`);
    if (!confirmed) {
      return;
    }

    setPendingKey(`payment-delete-${method.id}`);

    try {
      const { error } = await supabase.from("payment_methods").delete().eq("id", method.id);
      if (error) {
        throw error;
      }

      setPaymentMethods((current) => current.filter((item) => item.id !== method.id));
      setToast({ tone: "success", message: `已刪除支付方式「${method.name}」。` });
    } catch (error) {
      setToast({ tone: "error", message: `刪除支付方式失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function copyPreviousMonthBudgets() {
    if (!window.confirm("要用上個月的預算配置覆蓋本月目前的金額嗎？")) {
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
          remaining: nextAllocated - row.spent,
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

  async function applyAutoBudgets() {
    const autoRows = rows.filter((row) => row.isAuto && row.autoAmount > 0);
    if (autoRows.length === 0) {
      setToast({ tone: "info", message: "目前沒有可套用的固定預算。" });
      return;
    }

    if (!window.confirm(`要將 ${autoRows.length} 個固定預算一次套用到本月嗎？`)) {
      return;
    }

    setPendingKey("auto-all");

    try {
      const nextRows = rows.map((row) =>
        row.isAuto && row.autoAmount > 0
          ? {
              ...row,
              allocated: row.autoAmount,
              remaining: row.autoAmount - row.spent,
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

  return (
    <main className="min-h-screen bg-background px-4 py-4 pb-[88px] font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <section className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label-md text-on-surface-variant">預算分配</p>
            <p className="text-headline-sm">{formatMonthLabel(monthId)}</p>
          </div>
        </div>

        <MonthSwitcher
          monthId={monthId}
          onPrevious={() => setMonthId((value) => shiftMonth(value, -1))}
          onNext={() => setMonthId((value) => shiftMonth(value, 1))}
        />

        {loading ? <LoadingCard label="正在載入預算分配頁..." /> : null}
        {!loading && loadError ? (
          <StateCard title="載入失敗" description={loadError} tone="error" actionLabel="重試" onAction={() => void reload()} />
        ) : null}

        {!loading && !loadError ? (
          <>
            {/* M3 sticky top summary (本月收入 + 已分配 + 剩餘可分配) */}
            <section className="sticky top-3 z-20 rounded-md border border-outline bg-surface p-4 shadow-elev-1">
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

            <section className="rounded-md border border-outline bg-surface p-4">
              <h2 className="mb-3 text-title-md">月初規劃捷徑</h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-outline-variant bg-transparent px-4 text-body-md font-medium text-primary transition-colors duration-m3-short hover:bg-primary/5 active:bg-primary/10 disabled:opacity-40"
                  onClick={() => void copyPreviousMonthBudgets()}
                  disabled={pendingKey === "copy"}
                >
                  {pendingKey === "copy" ? "複製中" : "複製上月預算"}
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-body-md font-medium text-primary-on transition-colors duration-m3-short hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40"
                  onClick={() => void applyAutoBudgets()}
                  disabled={pendingKey === "auto-all"}
                >
                  {pendingKey === "auto-all" ? "套用中" : "批次套用固定預算"}
                </button>
              </div>
            </section>

            {groupedRows.map((group) => (
              <section key={group.groupId} className="rounded-md border border-outline bg-surface">
                <div className="flex items-center justify-between gap-2 border-b border-outline px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
                      aria-label={`${group.groupName} ${collapsedGroups[group.groupId] ? "展開" : "收合"}`}
                      onClick={() => toggleGroup(group.groupId)}
                    >
                      {collapsedGroups[group.groupId] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <span className="text-title-sm">{group.groupName}</span>
                    <span className="rounded-full bg-secondary-container px-2 py-0.5 text-label-sm text-secondary-on-container">
                      {group.rows.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="hidden font-mono text-body-sm tabular-nums text-on-surface-variant sm:block">
                      ${group.rows.reduce((sum, row) => sum + row.allocated, 0).toLocaleString("en-US")}
                    </p>
                    <div className="relative">
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
                        aria-label={`${group.groupName} 設定`}
                        onClick={() => setOpenGroupMenuId((current) => (current === group.groupId ? null : group.groupId))}
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                      {openGroupMenuId === group.groupId ? (
                        <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-outline bg-surface p-1 shadow-elev-2">
                          <button
                            type="button"
                            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-on-surface hover:bg-on-surface/5 disabled:opacity-40"
                            onClick={() => void reorderGroups(group.groupId, -1)}
                            disabled={pendingKey === `group-sort-${group.groupId}`}
                          >
                            大項上移
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-on-surface hover:bg-on-surface/5 disabled:opacity-40"
                            onClick={() => void reorderGroups(group.groupId, 1)}
                            disabled={pendingKey === `group-sort-${group.groupId}`}
                          >
                            大項下移
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-on-surface hover:bg-on-surface/5 disabled:opacity-40"
                            onClick={() => void renameGroup(group)}
                            disabled={pendingKey === `group-rename-${group.groupId}`}
                          >
                            重新命名
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-primary hover:bg-primary/5 disabled:opacity-40"
                            onClick={() => void addCategoryToGroup(group)}
                            disabled={pendingKey === `add-${group.groupId}`}
                          >
                            {pendingKey === `add-${group.groupId}` ? "新增中" : "新增小項目"}
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-money-expense hover:bg-money-expense/5 disabled:opacity-40"
                            onClick={() => void deleteGroup(group)}
                            disabled={pendingKey === `group-delete-${group.groupId}`}
                          >
                            刪除大項
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {!collapsedGroups[group.groupId] ? (
                  <div className="p-3">
                    <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,0.72fr)_minmax(0,0.72fr)_minmax(0,0.82fr)_minmax(0,0.82fr)] gap-2 border-b border-outline pb-2 text-label-sm uppercase tracking-wider text-on-surface-variant">
                      <p className="pl-2">小項</p>
                      <p className="text-center">上月分配</p>
                      <p className="text-center">上月支出</p>
                      <p className="text-center">固定預算</p>
                      <p className="text-center">本月預算</p>
                    </div>

                    <div className="space-y-2 pt-2">
                      {group.rows.map((row) => {
                        const previous = previousReferenceMap[row.categoryId] ?? {
                          allocated: 0,
                          spent: 0,
                        };
                        return (
                          <div
                            key={row.budgetId}
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
                              value={String(row.allocated)}
                              onChange={(event) => {
                                const nextValue = Number(event.target.value.replace(/[^\d]/g, "") || 0);
                                setRows((current) =>
                                  current.map((item) =>
                                    item.budgetId === row.budgetId
                                      ? {
                                          ...item,
                                          allocated: nextValue,
                                          remaining: nextValue - item.spent,
                                        }
                                      : item,
                                  ),
                                );
                                scheduleBudgetSave(row.budgetId, row.categoryName, nextValue);
                              }}
                              className="h-9 w-full rounded-xs border border-outline-variant bg-surface px-2 text-center font-mono text-body-md tabular-nums text-on-surface outline-none focus:border-primary focus:border-2"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="px-5 py-3 text-body-sm text-on-surface-variant">
                    已收合，點左側箭頭可展開查看小項與預算欄位。
                  </p>
                )}
              </section>
            ))}

            <section className="rounded-md border border-outline bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-outline px-4 py-3">
                <h2 className="text-title-md">支付方式管理</h2>
                <p className="text-body-sm text-on-surface-variant">
                  {paymentMethods.length} 個
                </p>
              </div>

              <div className="space-y-2 p-3">
                {paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between gap-3 rounded-sm bg-surface-container-low px-3 py-2"
                  >
                    <p className="text-body-md font-medium text-on-surface">
                      {method.name}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded-full px-3 text-body-sm text-primary hover:bg-primary/5 active:bg-primary/10 disabled:opacity-40"
                        onClick={() => void renamePaymentMethod(method)}
                        disabled={pendingKey === `payment-rename-${method.id}`}
                      >
                        重新命名
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded-full px-3 text-body-sm text-money-expense hover:bg-money-expense/5 active:bg-money-expense/10 disabled:opacity-40"
                        onClick={() => void deletePaymentMethod(method)}
                        disabled={pendingKey === `payment-delete-${method.id}`}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex items-end gap-2 rounded-sm bg-surface-container-low px-3 py-2">
                  <label className="flex-1">
                    <span className="mb-1 block text-label-md text-on-surface-variant">
                      新增支付方式
                    </span>
                    <input
                      value={newPaymentMethodName}
                      onChange={(event) => setNewPaymentMethodName(event.target.value)}
                      className="h-10 w-full rounded-xs border border-outline-variant bg-surface px-3 text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
                      placeholder="例如：現金、信用卡 A"
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-body-md font-medium text-primary-on transition-colors duration-m3-short hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40"
                    onClick={() => void addPaymentMethod()}
                    disabled={pendingKey === "payment-add"}
                  >
                    {pendingKey === "payment-add" ? "新增中" : "新增"}
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
