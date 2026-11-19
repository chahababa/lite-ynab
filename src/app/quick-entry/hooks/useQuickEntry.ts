"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getAmbiguousCategoryNames } from "@/lib/categoryDisplay";
import { fetchQuickEntryData } from "@/lib/data";
import { parseHermesTransactionText } from "@/lib/hermesTransaction";
import { useLastPaymentMethod } from "@/lib/hooks/useLastPaymentMethod";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { CategoryOption, PaymentMethodOption, ToastState } from "@/lib/types";
import { getTodayInTaipei, toMonthId } from "@/lib/utils";

import {
  KEYPAD_KEYS,
  QUICK_GRID_SIZE,
  getErrorMessage,
  readRecentTemplates,
  saveRecentTemplates,
} from "../helpers";
import type { EntryType, LastSavedTransaction, QuickTemplate } from "../types";

/** All state, data loading and handlers of the quick-entry page; the page itself only renders. */
export function useQuickEntry() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [quickCategories, setQuickCategories] = useState<CategoryOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] =
    useLastPaymentMethod(paymentMethods);

  const [entryType, setEntryType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayInTaipei());
  const [textEntryBaseDate] = useState(getTodayInTaipei);
  const [hasUserModifiedDate, setHasUserModifiedDate] = useState(false);
  const [note, setNote] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  const [customDateInput, setCustomDateInput] = useState(date);
  const [textEntry, setTextEntry] = useState("");
  const [recentTemplates, setRecentTemplates] = useState<QuickTemplate[]>([]);
  const [lastSaved, setLastSaved] = useState<LastSavedTransaction | null>(null);
  const [isNoteVisible, setIsNoteVisible] = useState(false);

  const currentMonthId = useMemo(() => toMonthId(date), [date]);

  useEffect(() => {
    setRecentTemplates(readRecentTemplates());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchQuickEntryData(supabase, currentMonthId);
        if (!active) return;
        setAllCategories(data.allCategories);
        setQuickCategories(data.quickCategories);
        setPaymentMethods(data.paymentMethods);
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
  }, [currentMonthId]);

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((pm) => pm.id === selectedPaymentMethodId) ?? null,
    [paymentMethods, selectedPaymentMethodId],
  );

  const visibleQuickCategories = useMemo(
    () => quickCategories.slice(0, QUICK_GRID_SIZE),
    [quickCategories],
  );

  // 偵測 1×6 grid 內是否有同名分類（例如「個人/飲食」+「家庭/飲食」）
  // 範圍只看「實際在 grid 上顯示的 6 個」，不必管整個 allCategories。
  const ambiguousNames = useMemo(
    () => getAmbiguousCategoryNames(visibleQuickCategories),
    [visibleQuickCategories],
  );

  const noPaymentMethods = !loading && paymentMethods.length === 0;

  const amountValue = amount ? Number(amount) : 0;
  const parsedText = useMemo(() => {
    const raw = textEntry.trim();
    if (!raw) return null;
    return parseHermesTransactionText(raw, {
      categories: allCategories.map((category) => ({
        id: category.id,
        name: category.name,
        groupName: category.groupName,
      })),
      paymentMethods,
      baseDate: textEntryBaseDate,
    });
  }, [allCategories, paymentMethods, textEntry, textEntryBaseDate]);

  function handleKeypad(key: (typeof KEYPAD_KEYS)[number]) {
    if (key === "del") {
      setAmount((v) => v.slice(0, -1));
      return;
    }
    setAmount((v) => `${v}${key}`.replace(/^0+(?=\d)/, ""));
  }

  function handleEntryTypeChange(t: EntryType) {
    if (t === "expense") {
      setEntryType("expense");
      return;
    }
    setToast({ tone: "info", message: "v2.1 即將支援收入 / 轉帳記帳" });
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

  function applyTextEntry() {
    if (!parsedText) {
      setToast({ tone: "info", message: "請先輸入文字記帳內容" });
      return;
    }
    if (parsedText.amount) setAmount(String(parsedText.amount));
    if (parsedText.categoryId) setSelectedCategoryId(parsedText.categoryId);
    if (parsedText.paymentMethodId) setSelectedPaymentMethodId(parsedText.paymentMethodId);
    setDate(parsedText.date);
    setHasUserModifiedDate(parsedText.date !== getTodayInTaipei());
    setNote(parsedText.note);
    setToast({
      tone: parsedText.warnings.length > 0 ? "info" : "success",
      message:
        parsedText.warnings.length > 0
          ? `已帶入可辨識欄位，請補：${parsedText.warnings.join("、")}`
          : "已解析文字記帳，確認後可儲存。",
    });
  }

  function applyTemplate(template: QuickTemplate) {
    setAmount(String(template.amount));
    setSelectedCategoryId(template.categoryId);
    setSelectedPaymentMethodId(template.paymentMethodId);
    setNote(template.note);
    setToast({ tone: "info", message: `已套用「${template.label}」，確認後可儲存。` });
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
      setToast({ tone: "info", message: "請先到設定建立支付方式" });
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

      const { error } = await supabase.from("transactions").insert({
        amount: nextAmount,
        date: dateToSubmit,
        category_id: categoryId,
        payment_method_id: selectedPaymentMethodId,
        note: note.trim(),
        source: "manual",
        source_text: null,
        source_id: null,
        metadata: { entrypoint: "quick-entry" },
      });
      if (error) throw error;

      const savedInfo: LastSavedTransaction = {
        amount: nextAmount,
        categoryName: category?.name ?? "未命名分類",
        paymentMethodName: selectedPaymentMethod?.name ?? "未設定",
        note: note.trim(),
      };
      setLastSaved(savedInfo);
      const nextTemplate: QuickTemplate = {
        id: `${categoryId}-${selectedPaymentMethodId}-${nextAmount}-${note.trim()}`,
        label: `${category?.name ?? "未命名分類"} $${nextAmount.toLocaleString("en-US")}`,
        amount: nextAmount,
        categoryId,
        categoryName: category?.name ?? "未命名分類",
        paymentMethodId: selectedPaymentMethodId,
        paymentMethodName: selectedPaymentMethod?.name ?? "未設定",
        note: note.trim(),
      };
      setRecentTemplates((current) => {
        const deduped = [nextTemplate, ...current.filter((item) => item.id !== nextTemplate.id)].slice(0, 4);
        saveRecentTemplates(deduped);
        return deduped;
      });

      setToast({
        tone: "success",
        message: `已記帳 $${nextAmount.toLocaleString("en-US")} 至 ${category?.name ?? "未命名分類"}`,
      });
      resetAfterSubmit();
      router.refresh();
    } catch {
      setToast({ tone: "error", message: "記帳失敗，請稍後再試" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    router,
    allCategories,
    paymentMethods,
    selectedPaymentMethodId,
    setSelectedPaymentMethodId,
    entryType,
    amount,
    date,
    note,
    setNote,
    selectedCategoryId,
    setSelectedCategoryId,
    loading,
    loadError,
    isSubmitting,
    toast,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    isCategoryModalOpen,
    setIsCategoryModalOpen,
    isDateSheetOpen,
    setIsDateSheetOpen,
    customDateInput,
    setCustomDateInput,
    textEntry,
    setTextEntry,
    recentTemplates,
    lastSaved,
    isNoteVisible,
    setIsNoteVisible,
    selectedPaymentMethod,
    visibleQuickCategories,
    ambiguousNames,
    noPaymentMethods,
    amountValue,
    parsedText,
    handleKeypad,
    handleEntryTypeChange,
    handleDateChipClick,
    applyDate,
    applyCustomDate,
    applyTextEntry,
    applyTemplate,
    handleQuickCategoryTap,
    submitTransaction,
  };
}
