"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Plus } from "lucide-react";

import { BudgetList } from "@/components/BudgetList";
import { LoadingCard } from "@/components/LoadingCard";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Toast } from "@/components/Toast";
import { TransactionList } from "@/components/TransactionList";
import { fetchDashboardData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { BudgetRow, Category, ToastState, TransactionWithCategory } from "@/lib/types";
import {
  cn,
  formatCurrency,
  getTodayInTaipei,
  shiftMonth,
  toMonthId,
} from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [monthId, setMonthId] = useState(() => toMonthId(getTodayInTaipei()));
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionWithCategory[]>([]);
  const [incomeAmount, setIncomeAmount] = useState("0");
  const [unallocated, setUnallocated] = useState(0);
  const [quickCount, setQuickCount] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingBudgetId, setPendingBudgetId] = useState<string | null>(null);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [isSavingIncome, setIsSavingIncome] = useState(false);

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

      try {
        const data = await fetchDashboardData(supabase, monthId);

        if (!active) {
          return;
        }

        setEmail(data.user.email ?? "");
        setCategories(data.categories);
        setBudgetRows(data.budgetRows);
        setRecentTransactions(data.recentTransactions);
        setIncomeAmount((data.income?.amount ?? 0).toString());
        setUnallocated(data.unallocated);
        setQuickCount(data.quickCategories.length);
      } catch (error) {
        if (!active) {
          return;
        }

        const message =
          error instanceof Error && error.message === "AUTH_REQUIRED"
            ? "請先登入。"
            : "網路錯誤，請稍候。";

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

      showToast({ tone: "success", message: "本月預估薪水已更新。" });
      reload();
      router.refresh();
    } catch {
      showToast({ tone: "error", message: "網路錯誤，請稍候。" });
    } finally {
      setIsSavingIncome(false);
    }
  }

  async function saveBudget(budgetId: string, value: number) {
    setPendingBudgetId(budgetId);

    try {
      const { error } = await supabase
        .from("budgets")
        .update({ allocated: value })
        .eq("id", budgetId);

      if (error) {
        throw error;
      }

      showToast({ tone: "success", message: "預算已更新。" });
      reload();
      router.refresh();
    } catch {
      showToast({ tone: "error", message: "網路錯誤，請稍候。" });
    } finally {
      setPendingBudgetId(null);
    }
  }

  async function saveTransaction(input: {
    id: string;
    amount: number;
    date: string;
    categoryId: string;
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
          note: input.note,
        })
        .eq("id", input.id);

      if (error) {
        throw error;
      }

      showToast({ tone: "success", message: "交易紀錄已更新。" });
      reload();
      router.refresh();
    } catch {
      showToast({ tone: "error", message: "網路錯誤，請稍候。" });
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

      showToast({ tone: "success", message: "交易紀錄已刪除。" });
      reload();
      router.refresh();
    } catch {
      showToast({ tone: "error", message: "網路錯誤，請稍候。" });
    } finally {
      setPendingTransactionId(null);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-28 pt-5">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mb-5 flex items-center justify-between px-1">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Budget Flow</p>
          <p className="text-sm text-ink/70">{email || "載入中"}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink/70 shadow-sm"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <section className="space-y-4">
        <MonthSwitcher
          monthId={monthId}
          onPrevious={() => setMonthId((value) => shiftMonth(value, -1))}
          onNext={() => setMonthId((value) => shiftMonth(value, 1))}
        />

        {loading ? (
          <LoadingCard label="正在整理本月預算..." />
        ) : (
          <div className="rounded-[32px] bg-white/85 p-5 shadow-float backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-ink/45">Reservoir</p>
                <h2 className="mt-2 font-display text-2xl text-ink">本月預估薪水</h2>
              </div>
              <div className="rounded-full bg-sun/18 px-3 py-1 text-xs text-ink">
                {quickCount} 個快記分類
              </div>
            </div>

            <div className="mt-5 flex items-end gap-3">
              <label className="flex-1">
                <span className="mb-2 block text-sm text-ink/65">可運用金額</span>
                <input
                  inputMode="numeric"
                  value={incomeAmount}
                  onChange={(event) =>
                    setIncomeAmount(event.target.value.replace(/[^\d]/g, ""))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-4 text-xl outline-none transition focus:border-mint"
                />
              </label>
              <button
                type="button"
                disabled={isSavingIncome}
                onClick={() => void saveIncome()}
                className="rounded-2xl bg-ink px-4 py-4 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingIncome ? "儲存中" : "儲存"}
              </button>
            </div>

            <div className="mt-5 rounded-[28px] bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.26em] text-ink/45">尚未分配</p>
              <p
                className={cn(
                  "mt-2 font-display text-4xl",
                  unallocated < 0 ? "text-coral" : "text-mint",
                )}
              >
                {formatCurrency(unallocated)}
              </p>
              <p className="mt-2 text-sm text-ink/55">
                計算公式：本月預估薪水 - 所有分類已編預算總和
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-ink/45">Buckets</p>
            <h2 className="font-display text-2xl text-ink">預算水桶</h2>
          </div>
        </div>
        {loading ? (
          <LoadingCard />
        ) : (
          <BudgetList
            items={budgetRows}
            onSave={saveBudget}
            pendingBudgetId={pendingBudgetId}
          />
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-ink/45">History</p>
            <h2 className="font-display text-2xl text-ink">最近 10 筆記錄</h2>
          </div>
        </div>
        {loading ? (
          <LoadingCard />
        ) : (
          <TransactionList
            categories={categories}
            items={recentTransactions}
            pendingTransactionId={pendingTransactionId}
            onSave={saveTransaction}
            onDelete={deleteTransaction}
          />
        )}
      </section>

      <Link
        href="/quick-entry"
        className="fixed bottom-5 left-1/2 flex h-16 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-center gap-2 rounded-[28px] bg-sun px-5 text-base font-semibold text-ink shadow-float transition hover:brightness-95"
      >
        <Plus className="h-5 w-5" />
        快速記帳
      </Link>
    </main>
  );
}
