"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, CalendarRange, Download, Search, WalletCards, X } from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { TransactionList } from "@/components/TransactionList";
import { fetchTransactionsPageData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type {
  CategoryOption,
  PaymentMethodOption,
  ToastState,
  TransactionWithCategory,
} from "@/lib/types";
import { formatCurrency, getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

type SortOption =
  | "date-desc"
  | "date-asc"
  | "amount-desc"
  | "amount-asc"
  | "category-asc"
  | "payment-asc";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "發生未預期的錯誤";
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\ufeff${content}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number) {
  const stringValue = String(value ?? "");
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export default function TransactionsPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [monthId, setMonthId] = useState(() => toMonthId(getTodayInTaipei()));
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("date-desc");

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

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const data = await fetchTransactionsPageData(supabase, monthId);

        if (!active) {
          return;
        }

        setCategories(data.categories);
        setPaymentMethods(data.paymentMethods);
        setTransactions(data.transactions);
      } catch (error) {
        if (!active) {
          return;
        }

        const detail = getErrorMessage(error);
        const message =
          error instanceof Error && error.message === "AUTH_REQUIRED"
            ? "請先登入，才能查看交易列表。"
            : `載入交易列表失敗：${detail}`;

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

  const filteredTransactions = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const min = minAmount ? Number(minAmount) : null;
    const max = maxAmount ? Number(maxAmount) : null;

    const base = transactions.filter((item) => {
      const matchesKeyword =
        !keyword ||
        [
          item.categoryGroupName,
          item.categoryName,
          item.paymentMethodName,
          item.note,
          item.date,
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(keyword));

      const matchesCategory = !categoryFilter || item.category_id === categoryFilter;
      const matchesPaymentMethod =
        !paymentMethodFilter || item.payment_method_id === paymentMethodFilter;
      const matchesDateFrom = !dateFrom || item.date >= dateFrom;
      const matchesDateTo = !dateTo || item.date <= dateTo;
      const matchesMin = min === null || item.amount >= min;
      const matchesMax = max === null || item.amount <= max;

      return (
        matchesKeyword &&
        matchesCategory &&
        matchesPaymentMethod &&
        matchesDateFrom &&
        matchesDateTo &&
        matchesMin &&
        matchesMax
      );
    });

    return [...base].sort((left, right) => {
      switch (sortOption) {
        case "date-asc":
          return left.date.localeCompare(right.date);
        case "date-desc":
          return right.date.localeCompare(left.date);
        case "amount-asc":
          return left.amount - right.amount;
        case "amount-desc":
          return right.amount - left.amount;
        case "category-asc":
          return `${left.categoryGroupName}${left.categoryName}`.localeCompare(
            `${right.categoryGroupName}${right.categoryName}`,
            "zh-Hant",
          );
        case "payment-asc":
          return left.paymentMethodName.localeCompare(right.paymentMethodName, "zh-Hant");
        default:
          return 0;
      }
    });
  }, [
    categoryFilter,
    dateFrom,
    dateTo,
    maxAmount,
    minAmount,
    paymentMethodFilter,
    searchText,
    sortOption,
    transactions,
  ]);

  const totalFilteredAmount = useMemo(
    () => filteredTransactions.reduce((sum, item) => sum + item.amount, 0),
    [filteredTransactions],
  );

  function reload() {
    setRefreshTick((value) => value + 1);
  }

  function clearFilters() {
    setSearchText("");
    setCategoryFilter("");
    setPaymentMethodFilter("");
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setMaxAmount("");
    setSortOption("date-desc");
  }

  function exportCsv() {
    const lines = [
      ["日期", "大項分類", "分類", "支付方式", "金額", "備註"].join(","),
      ...filteredTransactions.map((item) =>
        [
          csvEscape(item.date),
          csvEscape(item.categoryGroupName),
          csvEscape(item.categoryName),
          csvEscape(item.paymentMethodName),
          csvEscape(item.amount),
          csvEscape(item.note ?? ""),
        ].join(","),
      ),
    ];

    downloadCsv(`transactions-${monthId}.csv`, lines.join("\n"));
    setToast({ tone: "success", message: "交易 CSV 已匯出。" });
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

      if (error) throw error;

      setToast({ tone: "success", message: "交易已更新。" });
      reload();
      return true;
    } catch {
      setToast({ tone: "error", message: "更新交易失敗，請稍後再試。" });
      return false;
    } finally {
      setPendingTransactionId(null);
    }
  }

  async function deleteTransaction(id: string) {
    setPendingTransactionId(id);

    try {
      const { error } = await supabase.from("transactions").delete().eq("id", id);

      if (error) throw error;

      setTransactions((current) => current.filter((item) => item.id !== id));
      setToast({ tone: "success", message: "已刪除交易" });
      return true;
    } catch {
      setToast({ tone: "error", message: "刪除交易失敗，請稍後再試。" });
      return false;
    } finally {
      setPendingTransactionId(null);
    }
  }

  return (
    // [v2.0 Step 3.5c partial M3]：page wrapper + 月份 + summary 已 M3 化；
    // 內部 filter 區塊 + transaction list 暫留 chrome（TransactionList 也用在 dashboard 之外）
    <main className="box-border min-h-screen bg-background px-4 py-4 pb-[88px] font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <section className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label-md text-on-surface-variant">交易紀錄</p>
            <p className="text-headline-sm">全部交易</p>
          </div>
        </div>

        <MonthSwitcher
          monthId={monthId}
          onPrevious={() => setMonthId((value) => shiftMonth(value, -1))}
          onNext={() => setMonthId((value) => shiftMonth(value, 1))}
        />

        {loading ? (
          <LoadingCard label="正在載入交易資料..." />
        ) : loadError ? (
          <StateCard title="載入交易失敗" description={loadError} tone="error" actionLabel="重試" onAction={reload} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-outline bg-surface p-4">
              <p className="text-label-md text-on-surface-variant">筆數</p>
              <p className="mt-1 font-mono text-num-display font-medium tabular-nums">
                {filteredTransactions.length}
              </p>
            </div>
            <div className="rounded-md border border-outline bg-money-expense-container p-4">
              <p className="text-label-md text-on-surface-variant">總金額</p>
              <p className="mt-1 font-mono text-num-display font-medium text-money-expense tabular-nums">
                {formatCurrency(totalFilteredAmount)}
              </p>
            </div>
          </div>
        )}

        {!loading && !loadError ? (
          <>
            <div className="chrome-window p-[6px]">
              <div className="chrome-titlebar flex items-center justify-between px-chrome-md py-chrome-sm">
                <h2 className="font-chrome-heading text-chrome-xl font-bold text-chrome-900">
                  篩選條件
                </h2>
                <button
                  type="button"
                  className="chrome-btn flex items-center gap-2 px-chrome-md py-chrome-sm text-chrome-sm"
                  onClick={clearFilters}
                >
                  <X className="h-4 w-4" />
                  清除篩選
                </button>
              </div>

              <div className="space-y-3 px-chrome-md py-chrome-md">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                    <Search className="h-4 w-4" />
                    搜尋
                  </span>
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                    placeholder="可搜尋分類、支付方式、備註、日期"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                      <WalletCards className="h-4 w-4" />
                      分類
                    </span>
                    <select
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value)}
                      className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                    >
                      <option value="">全部分類</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.groupName} / {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                      <WalletCards className="h-4 w-4" />
                      支付方式
                    </span>
                    <select
                      value={paymentMethodFilter}
                      onChange={(event) => setPaymentMethodFilter(event.target.value)}
                      className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                    >
                      <option value="">全部支付方式</option>
                      {paymentMethods.map((paymentMethod) => (
                        <option key={paymentMethod.id} value={paymentMethod.id}>
                          {paymentMethod.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                      <CalendarRange className="h-4 w-4" />
                      起始日期
                    </span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(event) => setDateFrom(event.target.value)}
                      className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                      <CalendarRange className="h-4 w-4" />
                      結束日期
                    </span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(event) => setDateTo(event.target.value)}
                      className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                      <WalletCards className="h-4 w-4" />
                      最低金額
                    </span>
                    <input
                      inputMode="numeric"
                      value={minAmount}
                      onChange={(event) => setMinAmount(event.target.value.replace(/[^\d]/g, ""))}
                      className="chrome-field chrome-field--numeric min-h-11 w-full px-chrome-md py-chrome-md"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                      <WalletCards className="h-4 w-4" />
                      最高金額
                    </span>
                    <input
                      inputMode="numeric"
                      value={maxAmount}
                      onChange={(event) => setMaxAmount(event.target.value.replace(/[^\d]/g, ""))}
                      className="chrome-field chrome-field--numeric min-h-11 w-full px-chrome-md py-chrome-md"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                    <ArrowDownUp className="h-4 w-4" />
                    排序
                  </span>
                  <select
                    value={sortOption}
                    onChange={(event) => setSortOption(event.target.value as SortOption)}
                    className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                  >
                    <option value="date-desc">日期：新到舊</option>
                    <option value="date-asc">日期：舊到新</option>
                    <option value="amount-desc">金額：大到小</option>
                    <option value="amount-asc">金額：小到大</option>
                    <option value="category-asc">分類排序</option>
                    <option value="payment-asc">支付方式排序</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="chrome-window p-[6px]">
              <div className="chrome-titlebar flex items-center justify-between px-chrome-md py-chrome-sm">
                <div>
                  <h2 className="font-chrome-heading text-chrome-xl font-bold text-chrome-900">
                    交易清單
                  </h2>
                  <p className="mt-1 text-chrome-sm text-chrome-800">
                    共 {filteredTransactions.length} 筆
                  </p>
                </div>
                <button
                  type="button"
                  className="chrome-btn flex items-center gap-2 px-chrome-md py-chrome-sm text-chrome-sm"
                  onClick={exportCsv}
                >
                  <Download className="h-4 w-4" />
                  匯出 CSV
                </button>
              </div>

              <div className="px-chrome-md py-chrome-md">
                <TransactionList
                  categories={categories}
                  paymentMethods={paymentMethods}
                  items={filteredTransactions}
                  pendingTransactionId={pendingTransactionId}
                  onSave={saveTransaction}
                  onDelete={deleteTransaction}
                />
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
