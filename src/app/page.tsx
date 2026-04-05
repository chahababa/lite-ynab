"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CreditCard, Delete, Plus, Search, Tag, X } from "lucide-react";

import { BudgetList } from "@/components/BudgetList";
import { LoadingCard } from "@/components/LoadingCard";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { TransactionList } from "@/components/TransactionList";
import { fetchDashboardData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type {
  BudgetRow,
  CategoryOption,
  PaymentMethodOption,
  ToastState,
  TransactionWithCategory,
} from "@/lib/types";
import { cn, formatCurrency, getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "發生未預期的錯誤";
}

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"];

type ExpenseCategoryMode = "quick" | "all";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [monthId, setMonthId] = useState(() => toMonthId(getTodayInTaipei()));
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionWithCategory[]>([]);
  const [incomeAmount, setIncomeAmount] = useState("0");
  const [unallocated, setUnallocated] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingBudgetId, setPendingBudgetId] = useState<string | null>(null);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [isSavingIncome, setIsSavingIncome] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseCategoryMode, setExpenseCategoryMode] = useState<ExpenseCategoryMode>("all");
  const [expenseDate, setExpenseDate] = useState(getTodayInTaipei());
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [selectedExpensePaymentMethodId, setSelectedExpensePaymentMethodId] = useState("");
  const [submittingExpenseCategoryId, setSubmittingExpenseCategoryId] = useState<string | null>(null);
  const [expenseCategoryQuery, setExpenseCategoryQuery] = useState("");

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
  }, []);

  const reload = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  useEffect(() => {
    const timer = toast ? window.setTimeout(() => setToast(null), 2600) : undefined;
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [toast]);

  useEffect(() => {
    if (!isExpenseModalOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isExpenseModalOpen]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const data = await fetchDashboardData(supabase, monthId);

        if (!active) {
          return;
        }

        setCategories(data.categoryOptions);
        setPaymentMethods(data.paymentMethods);
        setBudgetRows(data.budgetRows);
        setRecentTransactions(data.recentTransactions);
        setIncomeAmount(String(data.income?.amount ?? 0));
        setUnallocated(data.unallocated);
        setSelectedExpensePaymentMethodId((current) => current || data.paymentMethods[0]?.id || "");
      } catch (error) {
        if (!active) {
          return;
        }

        const detail = getErrorMessage(error);
        const message =
          error instanceof Error && error.message === "AUTH_REQUIRED"
            ? "請先登入，才能查看主控臺。"
            : `載入主控臺資料失敗：${detail}`;

        setLoadError(message);
        showToast({ tone: "error", message });

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
  }, [monthId, refreshTick, router, showToast, supabase]);

  const allocatedTotal = useMemo(
    () => budgetRows.reduce((sum, row) => sum + row.allocated, 0),
    [budgetRows],
  );

  const visibleExpenseCategories = (
    expenseCategoryMode === "quick" ? categories.filter((category) => category.isQuick) : categories
  ).filter((category) => {
    const query = expenseCategoryQuery.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return `${category.groupName} ${category.name}`.toLowerCase().includes(query);
  });

  async function saveIncome() {
    setIsSavingIncome(true);

    try {
      const amount = Number(incomeAmount || 0);
      const { error } = await supabase.from("monthly_incomes").upsert(
        {
          month_id: monthId,
          amount,
        },
        { onConflict: "user_id,month_id" },
      );

      if (error) {
        throw error;
      }

      setUnallocated(amount - allocatedTotal);
      showToast({ tone: "success", message: "本月收入已儲存。" });
    } catch {
      showToast({ tone: "error", message: "儲存本月收入失敗，請稍後再試。" });
    } finally {
      setIsSavingIncome(false);
    }
  }

  async function saveBudget(budgetId: string, value: number) {
    const previous = budgetRows.find((row) => row.budgetId === budgetId);
    setPendingBudgetId(budgetId);

    try {
      const { error } = await supabase.from("budgets").update({ allocated: value }).eq("id", budgetId);

      if (error) {
        throw error;
      }

      if (previous) {
        const diff = value - previous.allocated;

        setBudgetRows((current) =>
          current.map((row) =>
            row.budgetId === budgetId
              ? {
                  ...row,
                  allocated: value,
                  remaining: value - row.spent,
                }
              : row,
          ),
        );
        setUnallocated((current) => current - diff);
      }

      showToast({ tone: "success", message: "分類預算已儲存。" });
      return true;
    } catch {
      showToast({ tone: "error", message: "儲存分類預算失敗，請稍後再試。" });
      return false;
    } finally {
      setPendingBudgetId(null);
    }
  }

  async function saveTransaction(input: {
    id: string;
    amount: number;
    date: string;
    categoryId: string;
    paymentMethodId: string;
    note: string;
  }) {
    setPendingTransactionId(input.id);

    try {
      const { error } = await supabase
        .from("transactions")
        .update({
          amount: input.amount,
          date: input.date,
          category_id: input.categoryId,
          payment_method_id: input.paymentMethodId,
          note: input.note,
        })
        .eq("id", input.id);

      if (error) {
        throw error;
      }

      showToast({ tone: "success", message: "交易已更新。" });
      reload();
      router.refresh();
      return true;
    } catch {
      showToast({ tone: "error", message: "更新交易失敗，請稍後再試。" });
      return false;
    } finally {
      setPendingTransactionId(null);
    }
  }

  async function deleteTransaction(id: string) {
    setPendingTransactionId(id);

    try {
      const { error } = await supabase.from("transactions").delete().eq("id", id);

      if (error) {
        throw error;
      }

      showToast({ tone: "success", message: "交易已刪除。" });
      reload();
      router.refresh();
      return true;
    } catch {
      showToast({ tone: "error", message: "刪除交易失敗，請稍後再試。" });
      return false;
    } finally {
      setPendingTransactionId(null);
    }
  }

  function openExpenseModal() {
    setExpenseCategoryMode("all");
    setExpenseDate(getTodayInTaipei());
    setExpenseAmount("");
    setExpenseNote("");
    setExpenseCategoryQuery("");
    setSelectedExpensePaymentMethodId((current) => current || paymentMethods[0]?.id || "");
    setIsExpenseModalOpen(true);
  }

  function closeExpenseModal() {
    if (submittingExpenseCategoryId) {
      return;
    }

    setIsExpenseModalOpen(false);
  }

  function handleExpenseKeyPress(key: string) {
    if (key === "del") {
      setExpenseAmount((value) => value.slice(0, -1));
      return;
    }

    setExpenseAmount((value) => `${value}${key}`.replace(/^0+(?=\d)/, ""));
  }

  async function submitExpense(categoryId: string) {
    if (!expenseAmount || Number(expenseAmount) <= 0) {
      showToast({ tone: "info", message: "請先輸入金額。" });
      return;
    }

    if (!selectedExpensePaymentMethodId) {
      showToast({ tone: "info", message: "請先選擇支付方式。" });
      return;
    }

    setSubmittingExpenseCategoryId(categoryId);

    try {
      const { error } = await supabase.from("transactions").insert({
        amount: Number(expenseAmount),
        date: expenseDate,
        category_id: categoryId,
        payment_method_id: selectedExpensePaymentMethodId,
        note: expenseNote.trim(),
      });

      if (error) {
        throw error;
      }

      showToast({ tone: "success", message: "記帳成功。" });
      setIsExpenseModalOpen(false);
      setExpenseAmount("");
      setExpenseNote("");
      reload();
      router.refresh();
    } catch {
      showToast({ tone: "error", message: "記帳失敗，請稍後再試。" });
    } finally {
      setSubmittingExpenseCategoryId(null);
    }
  }

  return (
    <main className="min-h-screen bg-chrome-400 px-3 pb-40 pt-3 font-chrome-body text-chrome-base text-chrome-900">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <section className="mx-auto w-full max-w-md space-y-4">
        <div className="chrome-window p-[6px]">
          <div className="chrome-titlebar--info px-chrome-md py-chrome-sm text-center">
            <h1 className="font-chrome-heading text-[1.5rem] font-bold text-white">
              記帳與預算主控臺
            </h1>
          </div>
        </div>

        <MonthSwitcher
          monthId={monthId}
          onPrevious={() => setMonthId((value) => shiftMonth(value, -1))}
          onNext={() => setMonthId((value) => shiftMonth(value, 1))}
        />

        {loading ? (
          <LoadingCard label="正在載入主控臺資料..." />
        ) : loadError ? (
          <StateCard
            title="載入主控臺失敗"
            description={loadError}
            tone="error"
            actionLabel="重新載入"
            onAction={reload}
          />
        ) : (
          <>
            <section className="chrome-window p-[6px]">
              <div className="flex items-end gap-3 px-chrome-md pt-5">
                <label className="flex-1">
                  <span className="mb-2 block text-sm text-chrome-700">本月收入</span>
                  <input
                    inputMode="numeric"
                    value={incomeAmount}
                    onChange={(event) => setIncomeAmount(event.target.value.replace(/[^\d]/g, ""))}
                    className="chrome-field chrome-field--numeric min-h-11 w-full px-chrome-md py-chrome-md text-xl"
                  />
                </label>
                <button
                  type="button"
                  disabled={isSavingIncome}
                  onClick={() => void saveIncome()}
                  className="chrome-btn min-h-11 px-chrome-md py-chrome-md font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide disabled:cursor-not-allowed"
                >
                  {isSavingIncome ? "儲存中" : "儲存"}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 px-chrome-md pb-chrome-md">
                <div>
                  <p className="mb-2 text-sm uppercase tracking-[0.22em] text-chrome-700">
                    左側：目前還可以再分配多少預算
                  </p>
                  <div className="chrome-led-panel p-chrome-md text-center">
                    <p className="text-sm uppercase tracking-[0.22em] text-chrome-300">尚可分配</p>
                    <p
                      className={cn(
                        "mt-2 font-chrome-mono text-[2rem]",
                        unallocated < 0 ? "text-danger-light" : "text-[var(--chrome-led-green)]",
                      )}
                    >
                      {formatCurrency(unallocated)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm uppercase tracking-[0.22em] text-chrome-700">
                    右側：這個月已經分配出去的預算總額
                  </p>
                  <div className="chrome-led-panel p-chrome-md text-center">
                    <p className="text-sm uppercase tracking-[0.22em] text-chrome-300">已分配總額</p>
                    <p className="mt-2 font-chrome-mono text-[2rem] text-[var(--chrome-led-green)]">
                      {formatCurrency(allocatedTotal)}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="px-1">
                <p className="text-sm uppercase tracking-[0.28em] text-chrome-700">本月預算</p>
                <h2 className="mt-2 font-chrome-heading text-chrome-xl font-bold text-chrome-900">
                  預算總覽
                </h2>
              </div>
              <BudgetList
                items={budgetRows}
                onSave={saveBudget}
                pendingBudgetId={pendingBudgetId}
              />
            </section>

            <section className="space-y-3">
              <div className="px-1">
                <p className="text-sm uppercase tracking-[0.28em] text-chrome-700">最近交易</p>
                <h2 className="mt-2 font-chrome-heading text-chrome-xl font-bold text-chrome-900">
                  最近 10 筆記帳
                </h2>
              </div>
              <TransactionList
                categories={categories}
                paymentMethods={paymentMethods}
                items={recentTransactions}
                pendingTransactionId={pendingTransactionId}
                onSave={saveTransaction}
                onDelete={deleteTransaction}
              />
            </section>
          </>
        )}
      </section>

      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[999] px-3">
        <div className="pointer-events-none mx-auto flex w-full max-w-md justify-end">
          <button
            type="button"
            onClick={openExpenseModal}
            aria-label="開啟記帳視窗"
            className="pointer-events-auto chrome-btn chrome-btn--danger flex min-h-12 min-w-[144px] items-center justify-center gap-2 px-5 py-3 text-base font-bold tracking-[0.08em] shadow-[0_8px_18px_rgba(0,0,0,0.4)]"
          >
            <Plus className="h-4 w-4" />
            記帳
          </button>
        </div>
      </div>

      {isExpenseModalOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="關閉記帳視窗"
            onClick={closeExpenseModal}
            className="absolute inset-0 bg-black/40"
          />

          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md px-4 pb-4">
            <div role="dialog" aria-modal="true" aria-label="新增支出" className="chrome-window max-h-[92vh] overflow-y-auto p-[6px]">
              <div className="chrome-titlebar mb-chrome-md flex items-center justify-between gap-3 px-chrome-md py-chrome-sm">
                <div>
                  <p className="font-chrome-heading text-chrome-xs font-bold uppercase tracking-chrome-wide text-chrome-800">
                    quick expense
                  </p>
                  <p className="font-chrome-heading text-chrome-lg font-bold uppercase tracking-chrome-wide text-chrome-900">
                    記一筆支出
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeExpenseModal}
                  disabled={submittingExpenseCategoryId !== null}
                  className="chrome-btn flex h-9 w-9 items-center justify-center disabled:cursor-not-allowed"
                  aria-label="關閉記帳視窗"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-chrome-md px-chrome-md pb-chrome-md">
                <section className="chrome-led-panel relative px-chrome-lg py-chrome-xl">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div>
                      <p className="chrome-led-label text-chrome-sm uppercase">amount</p>
                      <p className="chrome-led-value mt-2 text-[2.2rem] leading-none">
                        {expenseAmount ? formatCurrency(Number(expenseAmount)) : formatCurrency(0)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-chrome-lg grid grid-cols-3 gap-chrome-md">
                    {keypad.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleExpenseKeyPress(key)}
                        className="chrome-btn flex min-h-11 items-center justify-center px-chrome-md py-chrome-lg font-chrome-heading text-chrome-xl font-bold uppercase tracking-chrome-wide"
                      >
                        {key === "del" ? <Delete className="h-4 w-4" /> : key}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="chrome-window p-chrome-md">
                  <div className="chrome-titlebar px-chrome-md py-chrome-sm">
                    <p className="font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-900">
                      input panel
                    </p>
                  </div>

                  <div className="mt-chrome-md space-y-chrome-md">
                    <label className="block">
                      <span className="mb-chrome-sm flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-800">
                        <CalendarDays className="h-4 w-4" />
                        日期
                      </span>
                      <input
                        type="date"
                        value={expenseDate}
                        onChange={(event) => setExpenseDate(event.target.value)}
                        className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                      />
                    </label>

                    <div className="block">
                      <span className="mb-chrome-sm flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-800">
                        <CreditCard className="h-4 w-4" />
                        支付方式
                      </span>
                      <div className="grid grid-cols-2 gap-chrome-sm">
                        {paymentMethods.map((method) => (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => setSelectedExpensePaymentMethodId(method.id)}
                            className={cn(
                              "chrome-btn min-h-11 px-chrome-md py-chrome-md text-chrome-sm font-bold uppercase tracking-chrome-wide",
                              selectedExpensePaymentMethodId === method.id && "chrome-btn--success text-white",
                            )}
                          >
                            {method.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="block">
                      <span className="mb-chrome-sm block font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-800">
                        備註
                      </span>
                      <input
                        value={expenseNote}
                        onChange={(event) => setExpenseNote(event.target.value)}
                        className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                        placeholder="補充這筆交易的用途或對象"
                      />
                    </label>
                  </div>
                </section>

                <section className="chrome-window p-chrome-md">
                  <div className="chrome-titlebar px-chrome-md py-chrome-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-900">
                        category selector
                      </p>
                      <div className="chrome-statusbar px-chrome-sm py-[3px] text-chrome-xs font-bold uppercase tracking-chrome-wide text-chrome-800">
                        {expenseCategoryMode === "quick" ? "quick" : "all"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-chrome-md grid grid-cols-2 gap-chrome-sm">
                    <button
                      type="button"
                      onClick={() => setExpenseCategoryMode("quick")}
                      className={cn(
                        "chrome-btn min-h-11 px-chrome-md py-chrome-md text-chrome-sm font-bold uppercase tracking-chrome-wide",
                        expenseCategoryMode === "quick" && "chrome-btn--success text-white",
                      )}
                    >
                      快速記帳
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseCategoryMode("all")}
                      className={cn(
                        "chrome-btn min-h-11 px-chrome-md py-chrome-md text-chrome-sm font-bold uppercase tracking-chrome-wide",
                        expenseCategoryMode === "all" && "chrome-btn--success text-white",
                      )}
                    >
                      全部分類
                    </button>
                  </div>

                  <label className="mt-chrome-md block">
                    <span className="mb-chrome-sm flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-800">
                      <Search className="h-4 w-4" />
                      搜尋
                    </span>
                    <input
                      value={expenseCategoryQuery}
                      onChange={(event) => setExpenseCategoryQuery(event.target.value)}
                      className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                      placeholder="搜尋分類名稱或大項名稱"
                    />
                  </label>

                  <div className="mt-chrome-md max-h-[320px] space-y-chrome-sm overflow-y-auto pr-1">
                    {visibleExpenseCategories.length === 0 ? (
                      <div className="chrome-led-panel px-chrome-md py-chrome-lg">
                        <p className="chrome-led-label text-chrome-sm uppercase">status</p>
                        <p className="mt-2 text-sm text-chrome-300">找不到符合�u件的分類。</p>
                      </div>
                    ) : (
                      visibleExpenseCategories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          disabled={submittingExpenseCategoryId !== null}
                          onClick={() => void submitExpense(category.id)}
                          className={cn(
                            "chrome-btn flex min-h-[88px] w-full items-stretch justify-between overflow-hidden p-0 text-left",
                            submittingExpenseCategoryId === category.id && "chrome-btn--success text-white",
                          )}
                        >
                          <div className="flex min-w-0 flex-1 items-center justify-center px-chrome-md py-chrome-md text-center">
                            <div className="min-w-0">
                              <p className="inline-flex min-w-[72px] items-center justify-center rounded-chrome-pill border border-chrome-700 bg-chrome-100 px-2 py-[2px] font-chrome-heading text-chrome-xs font-bold uppercase tracking-chrome-wide text-chrome-900">
                                {category.groupName}
                              </p>
                              <p className="mt-2 truncate font-chrome-heading text-chrome-lg font-bold text-chrome-900">
                                {category.name}
                              </p>
                            </div>
                          </div>
                          <div className="chrome-led-panel flex min-w-[112px] shrink-0 self-stretch flex-col items-center justify-center rounded-none border-l-2 border-y-0 border-r-0 px-chrome-sm py-[6px] text-center">
                            <p className="chrome-led-label text-chrome-xs uppercase">
                              {submittingExpenseCategoryId === category.id ? "saving" : "enter"}
                            </p>
                            <p className="chrome-led-value text-chrome-lg">
                              {expenseAmount ? formatCurrency(Number(expenseAmount)) : formatCurrency(0)}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
