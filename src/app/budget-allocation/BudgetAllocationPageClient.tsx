"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { ToastState } from "@/lib/types";
import { formatMonthLabel, shiftMonth } from "@/lib/utils";

import { BudgetGroupSection } from "./components/BudgetGroupSection";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { IncomeSummaryCard } from "./components/IncomeSummaryCard";
import { PaymentMethodManager } from "./components/PaymentMethodManager";
import { PlanningShortcutsCard } from "./components/PlanningShortcutsCard";
import { TextInputDialog } from "./components/TextInputDialog";
import { useBudgetAllocationData } from "./hooks/useBudgetAllocationData";
import { useBudgetAutosave } from "./hooks/useBudgetAutosave";
import { useBudgetBulkActions } from "./hooks/useBudgetBulkActions";
import { useBudgetDialogs } from "./hooks/useBudgetDialogs";
import { useCategoryActions } from "./hooks/useCategoryActions";
import { useCategoryGroupActions } from "./hooks/useCategoryGroupActions";
import { usePaymentMethodActions } from "./hooks/usePaymentMethodActions";

export default function BudgetAllocationCompactPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openGroupMenuId, setOpenGroupMenuId] = useState<string | null>(null);

  useEffect(() => {
    const timer = toast ? window.setTimeout(() => setToast(null), 2600) : undefined;
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [toast]);

  // Hook order matters: it fixes the order in which effects run (toast timer → autosave timer
  // cleanup → auth guard → data load), which is the same order as before the split.
  const { scheduleBudgetSave, scheduleAutoBudgetSave } = useBudgetAutosave({ supabase, setPendingKey, setToast });
  const {
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
    suggestionMap,
    groupedRows,
    allocatedTotal,
    unallocated,
    reload,
  } = useBudgetAllocationData({ supabase, router, setToast });
  const {
    confirmDialog,
    setConfirmDialog,
    textDialog,
    setTextDialog,
    textDialogValue,
    setTextDialogValue,
    openTextDialog,
    submitTextDialog,
    submitConfirmDialog,
  } = useBudgetDialogs();
  const { saveIncome, copyPreviousMonthBudgets, applyAutoBudgets, applySuggestedBudgets } = useBudgetBulkActions({
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
  });
  const { toggleQuickEntry, renameCategory, deleteCategory, addCategoryToGroup } = useCategoryActions({
    supabase,
    monthId,
    setRows,
    setOpenMenuId,
    setPendingKey,
    setToast,
    setConfirmDialog,
    openTextDialog,
  });
  const { collapsedGroups, toggleGroup, renameGroup, reorderGroups, deleteGroup, addGroup } = useCategoryGroupActions({
    supabase,
    monthId,
    rows,
    setRows,
    groupedRows,
    setPendingKey,
    setToast,
    setConfirmDialog,
    openTextDialog,
  });
  const { newPaymentMethodName, setNewPaymentMethodName, addPaymentMethod, renamePaymentMethod, deletePaymentMethod } =
    usePaymentMethodActions({
      supabase,
      paymentMethods,
      setPaymentMethods,
      setPendingKey,
      setToast,
      setConfirmDialog,
      openTextDialog,
    });

  return (
    <main className="min-h-screen bg-background px-4 py-4 pb-[88px] font-sans text-on-surface sm:px-6 lg:px-8">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <section className="mx-auto w-full max-w-7xl space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <p className="text-label-md text-on-surface-variant">預算分配</p>
            <p className="text-headline-sm">{formatMonthLabel(monthId)}</p>
            <p className="mt-1 max-w-2xl text-body-sm text-on-surface-variant lg:text-body-md">
              桌機版把收入、批次動作與分類明細分欄呈現，減少上下捲動，滑鼠可直接點選本月預算與固定預算欄位。
            </p>
          </div>
          <MonthSwitcher
            monthId={monthId}
            onPrevious={() => setMonthId((value) => shiftMonth(value, -1))}
            onNext={() => setMonthId((value) => shiftMonth(value, 1))}
          />
        </div>

        {/* 引導模式入口：月初分配的主要路徑 */}
        <Link
          href="/budget-allocation/wizard"
          className="flex items-center justify-between gap-3 rounded-md bg-primary-container p-4 shadow-elev-1 transition-colors duration-m3-short hover:brightness-95 active:brightness-90"
        >
          <div>
            <p className="text-title-md text-primary-on-container">開始本月分配</p>
            <p className="mt-0.5 text-body-sm text-primary-on-container/70">
              一次一組引導你分完，照上月一鍵帶入，待分配歸零就完成
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-on-container text-primary-container">
            <ArrowRight className="h-5 w-5" />
          </span>
        </Link>

        {loading ? <LoadingCard label="正在載入預算分配頁..." /> : null}
        {!loading && loadError ? (
          <StateCard title="載入失敗" description={loadError} tone="error" actionLabel="重試" onAction={() => void reload()} />
        ) : null}

        {!loading && !loadError ? (
          <div
            data-testid="budget-allocation-desktop-workspace"
            className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start xl:grid-cols-[380px_minmax(0,1fr)]"
          >
            <aside className="space-y-4 lg:sticky lg:top-4">
              {/* M3 sticky top summary (本月收入 + 已分配 + 剩餘可分配) */}
              <IncomeSummaryCard
                incomeAmount={incomeAmount}
                setIncomeAmount={setIncomeAmount}
                saveIncome={saveIncome}
                pendingKey={pendingKey}
                allocatedTotal={allocatedTotal}
                unallocated={unallocated}
              />

              <PlanningShortcutsCard
                pendingKey={pendingKey}
                copyPreviousMonthBudgets={copyPreviousMonthBudgets}
                applyAutoBudgets={applyAutoBudgets}
                applySuggestedBudgets={applySuggestedBudgets}
                suggestionCount={rows.filter((row) => suggestionMap[row.categoryId]).length}
              />
            </aside>

            <div className="min-w-0 space-y-4">
              {groupedRows.map((group) => (
                <BudgetGroupSection
                  key={group.groupId}
                  group={group}
                  pendingKey={pendingKey}
                  collapsedGroups={collapsedGroups}
                  toggleGroup={toggleGroup}
                  previousReferenceMap={previousReferenceMap}
                  groupMenu={{
                    openGroupMenuId,
                    setOpenGroupMenuId,
                    reorderGroups,
                    renameGroup,
                    addCategoryToGroup,
                    deleteGroup,
                  }}
                  categoryRow={{
                    openMenuId,
                    setOpenMenuId,
                    setRows,
                    toggleQuickEntry,
                    renameCategory,
                    deleteCategory,
                    scheduleAutoBudgetSave,
                    scheduleBudgetSave,
                  }}
                />
              ))}

              <button
                type="button"
                onClick={addGroup}
                disabled={pendingKey === "group-add"}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-outline bg-surface text-body-md font-medium text-primary transition-colors duration-m3-short hover:bg-primary/5 active:bg-primary/10 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                {pendingKey === "group-add" ? "新增中" : "新增大項"}
              </button>

              <PaymentMethodManager
                paymentMethods={paymentMethods}
                pendingKey={pendingKey}
                newPaymentMethodName={newPaymentMethodName}
                setNewPaymentMethodName={setNewPaymentMethodName}
                addPaymentMethod={addPaymentMethod}
                renamePaymentMethod={renamePaymentMethod}
                deletePaymentMethod={deletePaymentMethod}
              />
            </div>
          </div>
        ) : null}
      </section>

      {confirmDialog ? (
        <ConfirmDialog
          confirmDialog={confirmDialog}
          setConfirmDialog={setConfirmDialog}
          submitConfirmDialog={submitConfirmDialog}
        />
      ) : null}

      {textDialog ? (
        <TextInputDialog
          textDialog={textDialog}
          setTextDialog={setTextDialog}
          textDialogValue={textDialogValue}
          setTextDialogValue={setTextDialogValue}
          submitTextDialog={submitTextDialog}
        />
      ) : null}
    </main>
  );
}
