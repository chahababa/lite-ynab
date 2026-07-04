"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, PartyPopper } from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { Button as M3Button } from "@/components/m3/Button";
import { MoneyText } from "@/components/m3/MoneyText";
import {
  fetchBudgetAllocationData,
  fetchBudgetReferenceData,
  type BudgetReferenceItem,
} from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { BudgetRow, ToastState } from "@/lib/types";
import { cn, formatMonthLabel, getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

type WizardGroup = {
  groupId: string;
  groupName: string;
  rows: BudgetRow[];
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "發生未預期的錯誤";
}

export default function BudgetAllocationWizardPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const monthId = useMemo(() => toMonthId(getTodayInTaipei()), []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [previousReference, setPreviousReference] = useState<Record<string, BudgetReferenceItem>>({});
  const [incomeAmount, setIncomeAmount] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // step 0 = 收入確認；1..N = 各大項；N+1 = 總結
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const [data, reference] = await Promise.all([
          fetchBudgetAllocationData(supabase, monthId),
          fetchBudgetReferenceData(supabase, shiftMonth(monthId, -1)),
        ]);

        if (!active) return;

        setRows(data.budgetRows);
        setIncomeAmount(String(data.income?.amount ?? 0));
        setDrafts(
          data.budgetRows.reduce<Record<string, string>>((acc, row) => {
            acc[row.budgetId] = String(row.allocated);
            return acc;
          }, {}),
        );
        setPreviousReference(
          reference.reduce<Record<string, BudgetReferenceItem>>((acc, item) => {
            acc[item.categoryId] = item;
            return acc;
          }, {}),
        );
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.message === "AUTH_REQUIRED") {
          router.replace("/login");
          return;
        }
        setLoadError(getErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthId]);

  const groups = useMemo<WizardGroup[]>(() => {
    const grouped = new Map<string, WizardGroup>();

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

  const totalSteps = groups.length + 2;
  const summaryStep = groups.length + 1;
  const incomeValue = Number(incomeAmount || 0);

  const allocatedTotal = useMemo(
    () => rows.reduce((sum, row) => sum + Number(drafts[row.budgetId] ?? row.allocated), 0),
    [rows, drafts],
  );
  const unallocated = incomeValue - allocatedTotal;

  function draftValue(row: BudgetRow) {
    return Number(drafts[row.budgetId] ?? row.allocated);
  }

  function setDraft(budgetId: string, value: string) {
    setDrafts((current) => ({ ...current, [budgetId]: value.replace(/[^\d]/g, "") }));
  }

  async function saveIncome() {
    const { error } = await supabase.from("monthly_incomes").upsert(
      {
        month_id: monthId,
        amount: incomeValue,
      },
      { onConflict: "user_id,month_id" },
    );

    if (error) throw error;
  }

  async function saveGroup(group: WizardGroup) {
    const changedRows = group.rows.filter((row) => draftValue(row) !== row.allocated);

    if (changedRows.length === 0) return;

    const responses = await Promise.all(
      changedRows.map((row) =>
        supabase.from("budgets").update({ allocated: draftValue(row) }).eq("id", row.budgetId),
      ),
    );
    const failed = responses.find((item) => item.error);
    if (failed?.error) throw failed.error;

    setRows((current) =>
      current.map((row) => {
        if (!changedRows.some((changed) => changed.budgetId === row.budgetId)) return row;
        const allocated = draftValue(row);
        return { ...row, allocated, remaining: allocated + row.carryover - row.spent };
      }),
    );
  }

  async function goNext() {
    setIsSaving(true);

    try {
      if (step === 0) {
        await saveIncome();
      } else if (step >= 1 && step <= groups.length) {
        await saveGroup(groups[step - 1]);
      }
      setStep((current) => Math.min(current + 1, summaryStep));
    } catch (error) {
      setToast({ tone: "error", message: `儲存失敗：${getErrorMessage(error)}` });
    } finally {
      setIsSaving(false);
    }
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 0));
  }

  const currentGroup = step >= 1 && step <= groups.length ? groups[step - 1] : null;

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4 pb-[88px]">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/budget-allocation"
            aria-label="離開引導模式"
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="text-center">
            <p className="text-title-md">本月預算分配</p>
            <p className="text-label-sm text-on-surface-variant">{formatMonthLabel(monthId)}</p>
          </div>
          <span className="w-10" />
        </div>

        {loading ? (
          <LoadingCard label="正在準備分配流程..." />
        ) : loadError ? (
          <StateCard
            title="載入失敗"
            description={loadError}
            tone="error"
            actionLabel="重試"
            onAction={() => router.refresh()}
          />
        ) : (
          <>
            {/* 待分配 sticky 摘要：分配過程全程可見 */}
            <div className="sticky top-3 z-20 rounded-md bg-primary-container p-4 shadow-elev-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-label-md text-primary-on-container/70">待分配</p>
                  <MoneyText
                    value={unallocated}
                    type={unallocated < 0 ? "warn" : "remain"}
                    size="display"
                    prefix={false}
                    className="!text-primary-on-container"
                  />
                </div>
                <div className="text-right text-label-sm text-primary-on-container/70">
                  <p>收入 ${incomeValue.toLocaleString("en-US")}</p>
                  <p>已分配 ${allocatedTotal.toLocaleString("en-US")}</p>
                  <p className="mt-1">
                    {step === 0
                      ? "步驟 1：確認收入"
                      : step === summaryStep
                        ? "完成"
                        : `第 ${step}/${groups.length} 組`}
                  </p>
                </div>
              </div>
              {unallocated < 0 ? (
                <p className="mt-2 text-label-sm font-medium text-money-warn">
                  已超過收入 ${Math.abs(unallocated).toLocaleString("en-US")}，建議回頭調低某些分類。
                </p>
              ) : null}
            </div>

            {/* Step 0：收入確認 */}
            {step === 0 ? (
              <section className="rounded-md border border-outline bg-surface p-5">
                <h2 className="text-title-md">先確認本月收入</h2>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  已自動帶入最近一次填寫的收入，若這個月不同可直接修改。
                </p>
                <input
                  inputMode="numeric"
                  aria-label="本月收入金額"
                  value={incomeAmount}
                  onChange={(event) => setIncomeAmount(event.target.value.replace(/[^\d]/g, ""))}
                  className="mt-4 h-12 w-full rounded-xs border border-outline-variant bg-surface px-4 text-center font-mono text-num-title tabular-nums text-on-surface outline-none focus:border-primary focus:border-2"
                />
              </section>
            ) : null}

            {/* Step 1..N：逐大項分配 */}
            {currentGroup ? (
              <section className="rounded-md border border-outline bg-surface p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-title-md">{currentGroup.groupName}</h2>
                  <p className="text-label-md text-on-surface-variant">
                    小計 $
                    {currentGroup.rows
                      .reduce((sum, row) => sum + draftValue(row), 0)
                      .toLocaleString("en-US")}
                  </p>
                </div>

                <div className="space-y-2">
                  {currentGroup.rows.map((row) => {
                    const previous = previousReference[row.categoryId];
                    const value = drafts[row.budgetId] ?? String(row.allocated);

                    return (
                      <div
                        key={row.budgetId}
                        className="rounded-sm border border-outline-variant bg-surface-container-low px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-body-md font-medium">{row.categoryName}</p>
                            <p className="text-label-sm text-on-surface-variant">
                              {previous
                                ? `上月 $${previous.allocated.toLocaleString("en-US")}・花 $${previous.spent.toLocaleString("en-US")}`
                                : "上月沒有資料"}
                              {row.carryover > 0
                                ? `・結轉 $${row.carryover.toLocaleString("en-US")}`
                                : ""}
                            </p>
                          </div>
                          <input
                            inputMode="numeric"
                            aria-label={`${currentGroup.groupName} ${row.categoryName} 本月預算`}
                            value={value}
                            onChange={(event) => setDraft(row.budgetId, event.target.value)}
                            className="h-10 w-[86px] shrink-0 rounded-xs border border-outline-variant bg-surface px-2 text-center font-mono text-body-md tabular-nums text-on-surface outline-none focus:border-primary focus:border-2"
                          />
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          {previous && previous.allocated > 0 ? (
                            <button
                              type="button"
                              onClick={() => setDraft(row.budgetId, String(previous.allocated))}
                              className={cn(
                                "rounded-full border px-3 py-1 text-label-md transition-colors duration-m3-short",
                                Number(value || 0) === previous.allocated
                                  ? "border-primary bg-primary-container text-primary-on-container"
                                  : "border-outline text-on-surface-variant hover:bg-on-surface/5",
                              )}
                            >
                              照上月 ${previous.allocated.toLocaleString("en-US")}
                            </button>
                          ) : null}
                          {row.isAuto && row.autoAmount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setDraft(row.budgetId, String(row.autoAmount))}
                              className={cn(
                                "rounded-full border px-3 py-1 text-label-md transition-colors duration-m3-short",
                                Number(value || 0) === row.autoAmount
                                  ? "border-primary bg-primary-container text-primary-on-container"
                                  : "border-outline text-on-surface-variant hover:bg-on-surface/5",
                              )}
                            >
                              照固定 ${row.autoAmount.toLocaleString("en-US")}
                            </button>
                          ) : null}
                          {Number(value || 0) > 0 ? (
                            <button
                              type="button"
                              onClick={() => setDraft(row.budgetId, "0")}
                              className="rounded-full border border-outline px-3 py-1 text-label-md text-on-surface-variant transition-colors duration-m3-short hover:bg-on-surface/5"
                            >
                              歸零
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* 總結頁 */}
            {step === summaryStep ? (
              <section className="rounded-md border border-outline bg-surface p-5">
                <div className="flex items-center gap-2">
                  <PartyPopper className="h-5 w-5 text-primary" />
                  <h2 className="text-title-md">本月分配完成</h2>
                </div>

                <div className="mt-4 space-y-2">
                  {groups.map((group) => (
                    <div
                      key={group.groupId}
                      className="flex items-center justify-between rounded-sm bg-surface-container-low px-3 py-2"
                    >
                      <p className="text-body-md">{group.groupName}</p>
                      <p className="font-mono text-body-md tabular-nums">
                        ${group.rows.reduce((sum, row) => sum + draftValue(row), 0).toLocaleString("en-US")}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-sm border border-outline px-3 py-3 text-body-sm text-on-surface-variant">
                  {unallocated > 0
                    ? `還有 $${unallocated.toLocaleString("en-US")} 沒分配。可以回頭加到儲蓄類分類，或留著下次再分。`
                    : unallocated < 0
                      ? `分配超過收入 $${Math.abs(unallocated).toLocaleString("en-US")}，建議回頭調低某些分類。`
                      : "待分配歸零，每一塊錢都有了工作！"}
                </div>
              </section>
            ) : null}

            {/* 導覽按鈕 */}
            <div className="flex gap-2">
              {step > 0 ? (
                <M3Button variant="outlined" onClick={goBack} disabled={isSaving} className="flex-1 h-12">
                  上一步
                </M3Button>
              ) : null}
              {step < summaryStep ? (
                <M3Button
                  variant="filled"
                  onClick={() => void goNext()}
                  disabled={isSaving}
                  className="flex-1 h-12"
                  startIcon={<ArrowRight className="h-[18px] w-[18px]" />}
                >
                  {isSaving ? "儲存中..." : step === 0 ? "開始分配" : "儲存，下一組"}
                </M3Button>
              ) : (
                <M3Button
                  variant="filled"
                  onClick={() => router.push("/budget-usage")}
                  className="flex-1 h-12"
                  startIcon={<Check className="h-[18px] w-[18px]" />}
                >
                  完成，查看預算使用
                </M3Button>
              )}
            </div>

            <p className="text-center text-label-sm text-on-surface-variant">
              進度 {Math.min(step + 1, totalSteps)}/{totalSteps}・需要改分類或固定預算時請回
              <Link href="/budget-allocation" className="text-primary underline">
                預算分配管理頁
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
