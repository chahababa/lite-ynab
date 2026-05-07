"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Delete, Plus, Settings as SettingsIcon, X } from "lucide-react";

import { EntryFieldChip } from "@/components/EntryFieldChip";
import { Toast } from "@/components/Toast";
import { fetchQuickEntryData } from "@/lib/data";
import { getGroupTone } from "@/lib/groupTone";
import { useLastPaymentMethod } from "@/lib/hooks/useLastPaymentMethod";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { CategoryOption, PaymentMethodOption, ToastState } from "@/lib/types";
import { cn, formatCurrency, getTodayInTaipei, toMonthId } from "@/lib/utils";

const KEYPAD_KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "00", "0", "del"] as const;
const QUICK_GRID_SIZE = 8;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "載入快速記帳資料時發生未預期的錯誤。";
}

function formatDateChipLabel(value: string): string {
  return value === getTodayInTaipei() ? "今天" : value;
}

export default function QuickEntryPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [quickCategories, setQuickCategories] = useState<CategoryOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] =
    useLastPaymentMethod(paymentMethods);

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayInTaipei());
  const [hasUserModifiedDate, setHasUserModifiedDate] = useState(false);
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const currentMonthId = useMemo(() => toMonthId(date), [date]);

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
    // router & supabase are stable refs in production; excluded to avoid mock-induced re-fetch loops in tests
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


  function handleKeypad(key: (typeof KEYPAD_KEYS)[number]) {
    if (key === "del") {
      setAmount((v) => v.slice(0, -1));
      return;
    }
    setAmount((v) => `${v}${key}`.replace(/^0+(?=\d)/, ""));
  }

  function handleDateChipClick() {
    // Sprint 2 placeholder: 用瀏覽器原生 prompt 取日期，Sprint 3+ 之後可用 input[type=date]
    const next = window.prompt("輸入日期 (YYYY-MM-DD)，留空恢復今天", date);
    if (next === null) return;
    if (next === "") {
      setDate(getTodayInTaipei());
      setHasUserModifiedDate(false);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      setToast({ tone: "info", message: "日期格式請用 YYYY-MM-DD" });
      return;
    }
    setDate(next);
    setHasUserModifiedDate(true);
  }

  function handlePaymentMethodChipClick() {
    // Sprint 3 會接 PaymentMethodModal
    console.log("[quick-entry] payment method chip clicked");
  }

  function handleOpenMoreCategories() {
    // Sprint 4 會接 CategoryPickerModal
    console.log("[quick-entry] more-categories clicked");
  }

  function resetAfterSubmit() {
    setAmount("");
    setNote("");
    setDate(getTodayInTaipei());
    setHasUserModifiedDate(false);
  }

  async function submitTransaction(categoryId: string) {
    if (!amount || Number(amount) <= 0) {
      setToast({ tone: "info", message: "請先輸入金額" });
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
      });
      if (error) throw error;

      setToast({
        tone: "success",
        message: `已記帳 ${formatCurrency(nextAmount)} 至 ${category?.name ?? "未命名分類"}`,
      });
      resetAfterSubmit();
      router.refresh();
    } catch {
      setToast({ tone: "error", message: "記帳失敗，請稍後再試" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const amountDisplay = amount ? formatCurrency(Number(amount)) : formatCurrency(0);

  return (
    <main className="box-border min-h-screen bg-chrome-400 px-3 py-3 pb-[88px] font-chrome-body text-chrome-base text-chrome-900">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mx-auto w-full max-w-md chrome-window p-[6px]">
        {/* Header */}
        <div className="chrome-titlebar flex items-center justify-between gap-2 px-chrome-md py-chrome-sm">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="關閉"
            className="flex h-8 w-8 items-center justify-center rounded-chrome-btn border border-chrome-700 bg-chrome-100 text-chrome-900 hover:bg-chrome-50 active:bg-chrome-200"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="font-chrome-heading text-chrome-sm font-bold tracking-chrome-wider text-chrome-900">
            記一筆
          </p>
          <Link
            href="/settings"
            aria-label="設定"
            className="flex h-8 w-8 items-center justify-center rounded-chrome-btn border border-chrome-700 bg-chrome-100 text-chrome-900 hover:bg-chrome-50 active:bg-chrome-200"
          >
            <SettingsIcon className="h-4 w-4" />
          </Link>
        </div>

        {/* Amount + chips row */}
        <section className="mt-chrome-sm flex items-center justify-between gap-chrome-sm rounded-chrome-card border border-chrome-700 bg-chrome-100 px-chrome-md py-chrome-sm">
          <p
            className={cn(
              "font-chrome-mono text-[20px] font-bold leading-none",
              amount ? "text-danger-dark" : "text-chrome-700",
            )}
          >
            −{amountDisplay}
          </p>
          <div className="flex items-center gap-chrome-sm">
            <EntryFieldChip
              label={formatDateChipLabel(date)}
              ariaLabel={`日期 ${formatDateChipLabel(date)}`}
              onClick={handleDateChipClick}
            />
            <EntryFieldChip
              label={selectedPaymentMethod?.name ?? "未設定"}
              ariaLabel={`支付方式 ${selectedPaymentMethod?.name ?? "未設定"}`}
              onClick={handlePaymentMethodChipClick}
              disabled={paymentMethods.length === 0}
            />
          </div>
        </section>

        {/* Quick category 3x3 grid */}
        <section className="mt-chrome-sm">
          {loading ? (
            <div className="grid grid-cols-3 gap-chrome-sm">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-chrome-card border border-chrome-700 bg-chrome-200"
                />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-chrome-card border border-danger-light bg-chrome-100 px-chrome-md py-chrome-md text-chrome-sm text-danger-dark">
              {loadError}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-chrome-sm">
              {visibleQuickCategories.map((category) => {
                const tone = getGroupTone(category.groupName);
                return (
                  <button
                    key={category.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void submitTransaction(category.id)}
                    aria-label={`${category.groupName} ${category.name}`}
                    className={cn(
                      "relative flex aspect-square flex-col items-center justify-center rounded-chrome-card border border-chrome-700 bg-chrome-100 px-1 py-2 text-center transition-colors duration-fast hover:bg-chrome-50 active:bg-chrome-200",
                      "disabled:cursor-not-allowed disabled:bg-chrome-200 disabled:text-chrome-600",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-1 top-1 inline-block h-1.5 w-1.5 rounded-full",
                        tone.dot,
                      )}
                      aria-hidden
                    />
                    <span className="font-chrome-heading text-chrome-base font-bold leading-tight text-chrome-900">
                      {category.name}
                    </span>
                  </button>
                );
              })}

              {/* 「+ 更多」永遠在最後一格 */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleOpenMoreCategories}
                aria-label="更多分類"
                className={cn(
                  "flex aspect-square flex-col items-center justify-center rounded-chrome-card border border-dashed border-chrome-700 bg-chrome-100 px-1 py-2 text-chrome-800 transition-colors duration-fast hover:bg-chrome-50 active:bg-chrome-200",
                  "disabled:cursor-not-allowed disabled:bg-chrome-200 disabled:text-chrome-600",
                )}
              >
                <Plus className="h-5 w-5" />
                <span className="mt-1 font-chrome-heading text-chrome-sm font-bold">更多</span>
              </button>
            </div>
          )}
        </section>

        {/* Note (compact) */}
        <section className="mt-chrome-sm">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備註（可留空）"
            aria-label="備註"
            className="chrome-field min-h-9 w-full px-chrome-md py-chrome-sm text-chrome-sm"
          />
        </section>

        {/* Keypad 4x3 */}
        <section className="mt-chrome-sm grid grid-cols-3 gap-chrome-sm">
          {KEYPAD_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleKeypad(key)}
              aria-label={key === "del" ? "刪除" : key}
              className="chrome-btn flex min-h-9 items-center justify-center px-1 py-2 font-chrome-heading text-chrome-base font-bold tracking-chrome-wide"
            >
              {key === "del" ? <Delete className="h-4 w-4" /> : key}
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
