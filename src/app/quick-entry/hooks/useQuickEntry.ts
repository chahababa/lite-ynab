"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchQuickEntryData, type QuickBudgetStatus } from "@/lib/data";
import { useLastPaymentMethod } from "@/lib/hooks/useLastPaymentMethod";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { CategoryOption, PaymentMethodOption, ToastState } from "@/lib/types";
import { getTodayInTaipei, toMonthId } from "@/lib/utils";

import { KEYPAD_KEYS, QUICK_GRID_SIZE, getErrorMessage } from "../helpers";
import type { LastSavedTransaction } from "../types";

const EMPTY_SUMMARY: QuickBudgetStatus = { available: 0, spent: 0 };

/** All state, data loading and handlers of the quick-entry page; the page itself only renders. */
export function useQuickEntry() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [quickCategories, setQuickCategories] = useState<CategoryOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [quickPaymentMethods, setQuickPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [budgetStatusByCategory, setBudgetStatusByCategory] = useState<
    Record<string, QuickBudgetStatus>
  >({});
  const [monthSummary, setMonthSummary] = useState<QuickBudgetStatus>(EMPTY_SUMMARY);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] =
    useLastPaymentMethod(paymentMethods);

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayInTaipei());
  const [hasUserModifiedDate, setHasUserModifiedDate] = useState(false);
  const [note, setNote] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  const [customDateInput, setCustomDateInput] = useState(date);
  const [lastSaved, setLastSaved] = useState<LastSavedTransaction | null>(null);
  const [isNoteVisible, setIsNoteVisible] = useState(false);
  // 儲存或復原後 +1，讓「還剩多少」重新向資料庫取數字。
  const [reloadKey, setReloadKey] = useState(0);

  const currentMonthId = useMemo(() => toMonthId(date), [date]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;
    async function load() {
      // 只有第一次載入顯示骨架；儲存後的背景更新不讓格子閃爍。
      if (reloadKey === 0) setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchQuickEntryData(supabase, currentMonthId);
        if (!active) return;
        setAllCategories(data.allCategories);
        setQuickCategories(data.quickCategories);
        setPaymentMethods(data.paymentMethods);
        setQuickPaymentMethods(data.quickPaymentMethods ?? []);
        setBudgetStatusByCategory(data.budgetStatusByCategory ?? {});
        setMonthSummary(data.monthSummary ?? EMPTY_SUMMARY);
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.message === "AUTH_REQUIRED") {
          router.replace("/login");
          return;
        }
        const message = getErrorMessage(error);
        setLoadError(message);
        setToast({ tone: "error", message });
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthId, reloadKey]);

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((pm) => pm.id === selectedPaymentMethodId) ?? null,
    [paymentMethods, selectedPaymentMethodId],
  );

  // 頁面上直接顯示的支付方式按鈕：最常用的兩個；目前選的不在裡面時，換掉最後一個。
  const visiblePaymentMethods = useMemo(() => {
    const base = quickPaymentMethods.length > 0 ? quickPaymentMethods : paymentMethods.slice(0, 2);
    if (!selectedPaymentMethod || base.some((pm) => pm.id === selectedPaymentMethod.id)) {
      return base;
    }
    return [...base.slice(0, Math.max(base.length - 1, 0)), selectedPaymentMethod];
  }, [quickPaymentMethods, paymentMethods, selectedPaymentMethod]);

  // 最常用的幾個分類上格子；格子內照「大項 → 分類」的固定順序排，
  // 同一批分類的位置就不會因為使用次數變動而互換。
  const visibleQuickCategories = useMemo(() => {
    const order = new Map(allCategories.map((category, index) => [category.id, index]));
    return quickCategories
      .slice(0, QUICK_GRID_SIZE)
      .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  }, [quickCategories, allCategories]);

  const selectedCategory = useMemo(
    () => allCategories.find((category) => category.id === selectedCategoryId) ?? null,
    [allCategories, selectedCategoryId],
  );

  const noPaymentMethods = !loading && paymentMethods.length === 0;

  const amountValue = amount ? Number(amount) : 0;

  function handleKeypad(key: (typeof KEYPAD_KEYS)[number]) {
    if (key === "del") {
      setAmount((v) => v.slice(0, -1));
      return;
    }
    setAmount((v) => `${v}${key}`.replace(/^0+(?=\d)/, ""));
  }

  function handleDateChipClick() {
    setCustomDateInput(date);
    setIsDateSheetOpen(true);
  }

  function applyDate(nextDate: string, modified: boolean) {
    setDate(nextDate);
    setHasUserModifiedDate(modified);
    setCustomDateInput(nextDate);
    setIsDateSheetOpen(false);
  }

  function applyCustomDate() {
    const next = customDateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      setToast({ tone: "info", message: "日期格式請用 YYYY-MM-DD" });
      return;
    }
    applyDate(next, next !== getTodayInTaipei());
  }

  function handleQuickCategoryTap(categoryId: string) {
    setSelectedCategoryId(categoryId);
    if (amount && Number(amount) > 0 && selectedPaymentMethodId && !isSubmitting) {
      void submitTransaction(categoryId);
    }
  }

  function resetAfterSubmit() {
    setAmount("");
    setNote("");
    setIsNoteVisible(false);
    setSelectedCategoryId("");
    setDate(getTodayInTaipei());
    setHasUserModifiedDate(false);
  }

  async function submitTransaction(categoryIdOverride?: string) {
    const categoryId = categoryIdOverride ?? selectedCategoryId;
    if (!amount || Number(amount) <= 0) {
      setToast({ tone: "info", message: "請先輸入金額" });
      return;
    }
    if (!categoryId) {
      setToast({ tone: "info", message: "請先選擇分類" });
      return;
    }
    if (paymentMethods.length === 0) {
      setToast({ tone: "info", message: "請先建立支付方式" });
      return;
    }
    if (!selectedPaymentMethodId) {
      setToast({ tone: "info", message: "請先選擇支付方式" });
      return;
    }

    setIsSubmitting(true);
    try {
      const dateToSubmit = hasUserModifiedDate ? date : getTodayInTaipei();
      const nextAmount = Number(amount);
      const category =
        quickCategories.find((c) => c.id === categoryId) ??
        allCategories.find((c) => c.id === categoryId);

      const { data: inserted, error } = await supabase
        .from("transactions")
        .insert({
          amount: nextAmount,
          date: dateToSubmit,
          category_id: categoryId,
          payment_method_id: selectedPaymentMethodId,
          note: note.trim(),
          source: "manual",
          source_text: null,
          source_id: null,
          metadata: { entrypoint: "quick-entry" },
        })
        .select("id")
        .single();
      if (error) throw error;

      setLastSaved({
        id: (inserted as { id: string } | null)?.id ?? null,
        amount: nextAmount,
        categoryName: category?.name ?? "未命名分類",
        paymentMethodName: selectedPaymentMethod?.name ?? "未設定",
        note: note.trim(),
      });

      setToast({
        tone: "success",
        message: `已記帳 $${nextAmount.toLocaleString("en-US")} 至 ${category?.name ?? "未命名分類"}`,
      });
      resetAfterSubmit();
      setReloadKey((key) => key + 1);
    } catch {
      setToast({ tone: "error", message: "記帳失敗，請稍後再試" });
    } finally {
      setIsSubmitting(false);
    }
  }

  // 原地復原剛剛那一筆：只刪除本頁剛新增、還記得 id 的交易。
  async function undoLastSaved() {
    if (!lastSaved?.id || isUndoing) return;

    setIsUndoing(true);
    try {
      const { error } = await supabase.from("transactions").delete().eq("id", lastSaved.id);
      if (error) throw error;

      setToast({
        tone: "info",
        message: `已復原 ${lastSaved.categoryName} $${lastSaved.amount.toLocaleString("en-US")}`,
      });
      setLastSaved(null);
      setReloadKey((key) => key + 1);
    } catch {
      setToast({ tone: "error", message: "復原失敗，請到交易頁刪除這一筆" });
    } finally {
      setIsUndoing(false);
    }
  }

  return {
    router,
    allCategories,
    paymentMethods,
    visiblePaymentMethods,
    selectedPaymentMethodId,
    setSelectedPaymentMethodId,
    budgetStatusByCategory,
    monthSummary,
    amount,
    date,
    note,
    setNote,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategory,
    loading,
    loadError,
    isSubmitting,
    isUndoing,
    toast,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    isCategoryModalOpen,
    setIsCategoryModalOpen,
    isDateSheetOpen,
    setIsDateSheetOpen,
    customDateInput,
    setCustomDateInput,
    lastSaved,
    isNoteVisible,
    setIsNoteVisible,
    visibleQuickCategories,
    noPaymentMethods,
    amountValue,
    handleKeypad,
    handleDateChipClick,
    applyDate,
    applyCustomDate,
    handleQuickCategoryTap,
    submitTransaction,
    undoLastSaved,
  };
}
