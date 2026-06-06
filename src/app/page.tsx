"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Wallet,
} from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { Button as M3Button } from "@/components/m3/Button";
import { MoneyText } from "@/components/m3/MoneyText";
import { Progress } from "@/components/m3/Progress";
import {
  CAT_BG_CLASS,
  CAT_TEXT_CLASS,
  type M3CatIcon,
  getCategoryStyle,
} from "@/lib/categoryStyle";
import {
  getAmbiguousCategoryNames,
  getCategoryDisplay,
} from "@/lib/categoryDisplay";
import { fetchDashboardData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type {
  BudgetRow,
  CategoryOption,
  PaymentMethodOption,
  ToastState,
  TransactionWithCategory,
} from "@/lib/types";
import { cn, formatMonthLabel, getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

import {
  Car,
  Coffee,
  CreditCard,
  Heart,
  Home,
  Music,
  Plane,
  ShoppingBag,
  Tag,
  Utensils,
} from "lucide-react";

const ICON_COMPONENTS: Record<M3CatIcon, typeof Tag> = {
  Utensils,
  Coffee,
  Car,
  ShoppingBag,
  Home,
  Heart,
  Music,
  Plane,
  CreditCard,
  Tag,
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "發生未預期的錯誤";
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [monthId, setMonthId] = useState(() => toMonthId(getTodayInTaipei()));
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  // categories / paymentMethods 仍然 fetch 但暫不使用，留給後續 widgets
  const [, setCategories] = useState<CategoryOption[]>([]);
  const [, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionWithCategory[]>([]);
  const [incomeAmount, setIncomeAmount] = useState("0");
  const [toast, setToast] = useState<ToastState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [isSavingIncome, setIsSavingIncome] = useState(false);

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
  }, []);

  const reload = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/login");
    });
    return () => subscription.unsubscribe();
  }, [router, supabase]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchDashboardData(supabase, monthId);
        if (!active) return;
        setCategories(data.categoryOptions);
        setPaymentMethods(data.paymentMethods);
        setBudgetRows(data.budgetRows);
        setRecentTransactions(data.recentTransactions);
        setIncomeAmount(String(data.income?.amount ?? 0));
      } catch (error) {
        if (!active) return;
        const detail = getErrorMessage(error);
        const message =
          error instanceof Error && error.message === "AUTH_REQUIRED"
            ? "請先登入，才能查看主控臺。"
            : `載入主控臺失敗：${detail}`;
        setLoadError(message);
        showToast({ tone: "error", message });
        if (error instanceof Error && error.message === "AUTH_REQUIRED") {
          router.replace("/login");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthId, refreshTick]);

  const totalBudget = useMemo(
    () => budgetRows.reduce((s, r) => s + r.allocated, 0),
    [budgetRows],
  );
  const totalSpent = useMemo(
    () => budgetRows.reduce((s, r) => s + r.spent, 0),
    [budgetRows],
  );
  // 偵測同名分類（例如「個人/飲食」+「家庭/飲食」）以便顯示時加群組前綴
  const ambiguousBudgetNames = useMemo(
    () =>
      getAmbiguousCategoryNames(
        budgetRows.map((r) => ({ name: r.categoryName })),
      ),
    [budgetRows],
  );
  const ambiguousTxNames = useMemo(
    () =>
      getAmbiguousCategoryNames(
        recentTransactions.map((t) => ({ name: t.categoryName })),
      ),
    [recentTransactions],
  );
  const remainBudget = totalBudget - totalSpent;
  const usagePct =
    totalBudget > 0 ? Math.min(999, Math.round((totalSpent / totalBudget) * 100)) : 0;
  const incomeNum = Number(incomeAmount || 0);
  const savedNum = incomeNum - totalSpent;

  async function saveIncome() {
    setIsSavingIncome(true);
    try {
      const amount = Number(incomeAmount || 0);
      const { error } = await supabase.from("monthly_incomes").upsert(
        { month_id: monthId, amount },
        { onConflict: "user_id,month_id" },
      );
      if (error) throw error;
      showToast({ tone: "success", message: "本月收入已儲存。" });
      setIsEditingIncome(false);
      reload();
    } catch {
      showToast({ tone: "error", message: "儲存本月收入失敗，請稍後再試。" });
    } finally {
      setIsSavingIncome(false);
    }
  }

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4 pb-[88px]">
        {/* Top bar: month switcher */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label-md text-on-surface-variant">主控臺</p>
            <p className="text-headline-sm">{formatMonthLabel(monthId)}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonthId((v) => shiftMonth(v, -1))}
              aria-label="上個月"
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setMonthId((v) => shiftMonth(v, 1))}
              aria-label="下個月"
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingCard label="正在載入主控臺..." />
        ) : loadError ? (
          <StateCard
            title="載入主控臺失敗"
            description={loadError}
            tone="error"
            actionLabel="重試"
            onAction={reload}
          />
        ) : (
          <>
            {/* Hero balance card */}
            <div className="relative rounded-md bg-primary-container p-6 shadow-elev-1">
              <div className="pr-24">
                <div className="min-w-0">
                  <p className="text-body-sm text-primary-on-container/80">
                    本月剩餘預算
                  </p>
                  <div className="mt-1">
                    <MoneyText
                      value={remainBudget}
                      type={remainBudget < 0 ? "warn" : "remain"}
                      size="hero"
                      prefix={false}
                      className="!text-primary-on-container"
                    />
                  </div>
                  <p className="mt-2 text-body-sm text-primary-on-container/70">
                    預算{" "}
                    <MoneyText
                      value={totalBudget}
                      prefix={false}
                      className="!text-primary-on-container"
                      size="caption"
                    />{" "}
                    · 已用 <span className="font-mono tabular-nums">{usagePct}%</span>
                  </p>
                </div>
                <Link
                  href="/quick-entry"
                  aria-label="記一筆"
                  className="absolute right-6 top-9 flex h-14 w-24 items-center justify-center rounded-full bg-primary-on-container px-5 text-center text-body-md font-medium leading-tight text-primary-container shadow-elev-1 transition-colors hover:bg-primary-on-container/90 active:bg-primary-on-container/80"
                >
                  <span>
                    記一<br />筆
                  </span>
                </Link>
              </div>
              <div className="mt-5">
                <Progress
                  value={usagePct}
                  variant={usagePct >= 100 ? "expense" : "primary"}
                  ariaLabel="本月預算使用率"
                />
              </div>
            </div>

            {/* Income / Expense / Save tonal cards */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setIsEditingIncome(true)}
                className="rounded-md bg-money-income-container p-3 text-left transition-colors duration-m3-short hover:brightness-95 active:brightness-90"
                aria-label="編輯本月收入"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-label-sm text-on-surface-variant">收入</span>
                  <ArrowDownToLine className="h-3.5 w-3.5 text-on-surface-variant" />
                </div>
                <MoneyText value={incomeNum} type="income" size="title" prefix={false} />
              </button>
              <div className="rounded-md bg-money-expense-container p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-label-sm text-on-surface-variant">支出</span>
                  <ArrowUpFromLine className="h-3.5 w-3.5 text-on-surface-variant" />
                </div>
                <MoneyText
                  value={totalSpent}
                  type="expense"
                  size="title"
                  prefix={false}
                />
              </div>
              <div className="rounded-md bg-money-remain-container p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-label-sm text-on-surface-variant">結餘</span>
                  <Wallet className="h-3.5 w-3.5 text-on-surface-variant" />
                </div>
                <MoneyText
                  value={savedNum}
                  type={savedNum < 0 ? "warn" : "remain"}
                  size="title"
                  prefix={false}
                />
              </div>
            </div>

            {/* Categories grid */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-title-md">分類預算</h2>
                <Link
                  href="/budget-allocation"
                  className="text-label-md text-primary hover:underline"
                >
                  編輯 →
                </Link>
              </div>
              {budgetRows.length === 0 ? (
                <p className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
                  本月尚未設定預算分配
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {budgetRows.map((row) => {
                    const style = getCategoryStyle(row.categoryName);
                    const Icon = ICON_COMPONENTS[style.icon];
                    const pct =
                      row.allocated > 0
                        ? Math.min(100, Math.round((row.spent / row.allocated) * 100))
                        : 0;
                    const over = row.allocated > 0 && row.spent > row.allocated;
                    const display = getCategoryDisplay(
                      { name: row.categoryName, groupName: row.categoryGroupName },
                      ambiguousBudgetNames,
                    );
                    return (
                      <div
                        key={row.budgetId}
                        className="rounded-md border border-outline bg-surface p-4"
                      >
                        <div className="mb-3 flex items-center gap-2.5">
                          <div
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-sm",
                              `${CAT_BG_CLASS[style.color]}/15`,
                              CAT_TEXT_CLASS[style.color],
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {display.secondary ? (
                              <p className="truncate text-label-sm leading-none text-on-surface-variant">
                                {display.secondary}
                              </p>
                            ) : null}
                            <p className="truncate text-body-md font-medium">
                              {display.primary}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "text-label-sm font-medium",
                              over ? "text-money-expense" : "text-on-surface-variant",
                            )}
                          >
                            {pct}%
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <MoneyText
                            value={row.spent}
                            type={over ? "expense" : "neutral"}
                            size="title"
                            prefix={false}
                          />
                          <MoneyText
                            value={row.allocated}
                            size="caption"
                            prefix="/ "
                            className="text-on-surface-variant"
                          />
                        </div>
                        <Progress
                          value={pct}
                          variant={over ? "expense" : "primary"}
                          className="mt-2.5"
                          ariaLabel={`${row.categoryName} 預算使用`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Recent transactions */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-title-md">最近交易</h2>
                <Link
                  href="/transactions"
                  className="flex items-center gap-1 text-label-md text-primary hover:underline"
                >
                  查看全部 <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {recentTransactions.length === 0 ? (
                <p className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
                  本月尚無交易
                </p>
              ) : (
                <div className="rounded-md border border-outline bg-surface">
                  {recentTransactions.slice(0, 5).map((tx, i) => {
                    const style = getCategoryStyle(tx.categoryName);
                    const Icon = ICON_COMPONENTS[style.icon];
                    const display = getCategoryDisplay(
                      { name: tx.categoryName, groupName: tx.categoryGroupName },
                      ambiguousTxNames,
                    );
                    const fullName = display.secondary
                      ? `${display.secondary} / ${display.primary}`
                      : display.primary;
                    return (
                      <div
                        key={tx.id}
                        className={cn(
                          "flex items-center gap-3 px-5 py-3.5",
                          i > 0 && "border-t border-outline",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full",
                            `${CAT_BG_CLASS[style.color]}/15`,
                            CAT_TEXT_CLASS[style.color],
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-md font-medium">
                            {tx.note || fullName}
                          </p>
                          <p className="truncate text-body-sm text-on-surface-variant">
                            {fullName} · {tx.paymentMethodName} · {tx.date}
                          </p>
                        </div>
                        <MoneyText
                          value={tx.amount}
                          type="expense"
                          size="body"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Income edit dialog */}
      {isEditingIncome ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="編輯本月收入"
          onClick={() => !isSavingIncome && setIsEditingIncome(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[320px] rounded-md bg-surface shadow-elev-3"
          >
            <div className="px-5 pt-5 pb-3">
              <p className="text-title-md text-on-surface">本月收入</p>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                {formatMonthLabel(monthId)}
              </p>
            </div>
            <div className="px-5 pb-5">
              <input
                type="text"
                inputMode="numeric"
                value={incomeAmount}
                onChange={(e) =>
                  setIncomeAmount(e.target.value.replace(/[^\d]/g, ""))
                }
                aria-label="本月收入金額"
                className="h-12 w-full rounded-xs border border-outline-variant bg-surface px-4 text-center font-mono text-body-lg text-on-surface tabular-nums outline-none focus:border-primary focus:border-2 focus:px-[15px]"
              />
              <div className="mt-4 flex justify-end gap-2">
                <M3Button
                  variant="text"
                  onClick={() => setIsEditingIncome(false)}
                  disabled={isSavingIncome}
                >
                  取消
                </M3Button>
                <M3Button
                  variant="filled"
                  onClick={() => void saveIncome()}
                  disabled={isSavingIncome}
                  startIcon={<Pencil className="h-[18px] w-[18px]" />}
                >
                  {isSavingIncome ? "儲存中" : "儲存"}
                </M3Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
