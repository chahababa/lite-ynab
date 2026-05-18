"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Car,
  Check,
  Coffee,
  CreditCard,
  Delete,
  Heart,
  Home,
  Music,
  Plane,
  Settings as SettingsIcon,
  ShoppingBag,
  Tag,
  Utensils,
  X,
} from "lucide-react";

import { CategoryPickerModal } from "@/components/CategoryPickerModal";
import { PaymentMethodModal } from "@/components/PaymentMethodModal";
import { Toast } from "@/components/Toast";
import { Button as M3Button } from "@/components/m3/Button";
import { Chip as M3Chip } from "@/components/m3/Chip";
import { MoneyText } from "@/components/m3/MoneyText";
import {
  CAT_BORDER_CLASS,
  CAT_TEXT_CLASS,
  type M3CatIcon,
  getCategoryStyle,
} from "@/lib/categoryStyle";
import {
  getAmbiguousCategoryNames,
  getCategoryDisplay,
} from "@/lib/categoryDisplay";
import { fetchQuickEntryData } from "@/lib/data";
import { useLastPaymentMethod } from "@/lib/hooks/useLastPaymentMethod";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { CategoryOption, PaymentMethodOption, ToastState } from "@/lib/types";
import { cn, getTodayInTaipei, toMonthId } from "@/lib/utils";

type EntryType = "expense" | "income" | "transfer";
const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"] as const;
const QUICK_GRID_SIZE = 6;

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

  const [entryType, setEntryType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getTodayInTaipei());
  const [hasUserModifiedDate, setHasUserModifiedDate] = useState(false);
  const [note, setNote] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

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

  function resetAfterSubmit() {
    setAmount("");
    setNote("");
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

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-3 pb-[88px]">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="關閉"
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
          >
            <X className="h-5 w-5" />
          </button>
          <p className="text-title-md">記一筆</p>
          <Link
            href="/settings"
            aria-label="設定"
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
          >
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </div>

        {/* Type segmented toggle */}
        <div className="flex rounded-full bg-surface-container p-[3px]">
          {(
            [
              { key: "expense", label: "支出", color: "text-money-expense" },
              { key: "income", label: "收入", color: "text-money-income" },
              { key: "transfer", label: "轉帳", color: "text-on-surface" },
            ] as const
          ).map((t) => {
            const active = entryType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => handleEntryTypeChange(t.key)}
                className={cn(
                  "flex-1 h-8 rounded-full text-body-md font-medium transition-colors duration-m3-short",
                  active
                    ? cn("bg-surface shadow-elev-1", t.color)
                    : "bg-transparent text-on-surface-variant",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Banner: 沒有支付方式 */}
        {noPaymentMethods ? (
          <div className="rounded-md bg-money-warn-container px-4 py-2 text-body-sm text-money-warn">
            尚未建立支付方式，請先到{" "}
            <Link href="/settings" className="font-medium underline">
              設定
            </Link>{" "}
            建立。
          </div>
        ) : null}

        {/* Amount card */}
        <div className="flex items-baseline justify-between rounded-md bg-primary-container px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-label-sm uppercase text-primary-on-container/70">
              金額
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDateChipClick}
                aria-label={`日期 ${formatDateChipLabel(date)}`}
                className="text-label-md text-primary-on-container/70 hover:underline"
              >
                {formatDateChipLabel(date)}
              </button>
              <span className="text-label-md text-primary-on-container/40">·</span>
              <button
                type="button"
                onClick={() => {
                  if (paymentMethods.length === 0) return;
                  setIsPaymentModalOpen(true);
                }}
                disabled={paymentMethods.length === 0}
                aria-label={`支付方式 ${selectedPaymentMethod?.name ?? "未設定"}`}
                className="text-label-md text-primary-on-container/70 hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {selectedPaymentMethod?.name ?? "未設定"}
              </button>
            </div>
          </div>
          <MoneyText
            value={amountValue}
            type={entryType === "income" ? "income" : "expense"}
            size="display"
          />
        </div>

        {/* Category 1×6 grid */}
        <section>
          {loading ? (
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] animate-pulse rounded-sm bg-surface-container"
                />
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-md border border-money-expense bg-money-expense-container px-4 py-3 text-body-sm text-money-expense">
              {loadError}
            </div>
          ) : visibleQuickCategories.length === 0 ? (
            <p className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
              尚未標記常用分類，點下方「更多分類」選擇
            </p>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {visibleQuickCategories.map((category) => {
                const style = getCategoryStyle(category.name);
                const Icon = ICON_COMPONENTS[style.icon];
                const isSelected = selectedCategoryId === category.id;
                const display = getCategoryDisplay(category, ambiguousNames);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id)}
                    aria-label={`${category.groupName} ${category.name}`}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex flex-col items-center gap-0.5 px-1 py-2 rounded-[10px] transition-colors duration-m3-short",
                      isSelected
                        ? cn(
                            "border-[1.5px]",
                            CAT_BORDER_CLASS[style.color],
                            CAT_TEXT_CLASS[style.color],
                            "bg-on-surface/[0.04]",
                          )
                        : "border border-outline text-on-surface-variant hover:bg-on-surface/[0.03]",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {display.secondary ? (
                      <span className="text-[8px] leading-none opacity-70">
                        {display.secondary}
                      </span>
                    ) : null}
                    <span className="text-[10px] font-medium leading-tight">
                      {display.primary}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="mt-1 w-full text-label-md text-on-surface-variant hover:text-on-surface"
          >
            更多分類 →
          </button>
        </section>

        {/* Payment method chips */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {paymentMethods.map((pm) => (
            <M3Chip
              key={pm.id}
              selected={pm.id === selectedPaymentMethodId}
              onClick={() => setSelectedPaymentMethodId(pm.id)}
              className="h-7 px-3 text-body-sm flex-shrink-0"
            >
              {pm.name}
            </M3Chip>
          ))}
        </div>

        {/* Note */}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="備註（可留空）"
          aria-label="備註"
          className="h-10 px-4 rounded-xs border border-outline-variant bg-surface text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[15px]"
        />

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-1.5">
          {KEYPAD_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleKeypad(key)}
              aria-label={key === "del" ? "刪除" : key}
              className="h-11 rounded-md bg-surface-container text-on-surface font-mono text-num-title font-medium hover:bg-surface-container-high active:bg-surface-container-highest"
            >
              {key === "del" ? <Delete className="mx-auto h-5 w-5" /> : key}
            </button>
          ))}
        </div>

        {/* Save button (sticky bottom feel via mt-auto + page padding) */}
        <M3Button
          variant="filled"
          onClick={() => void submitTransaction()}
          disabled={isSubmitting}
          className="h-12 text-body-lg"
          startIcon={<Check className="h-[18px] w-[18px]" />}
        >
          儲存
        </M3Button>
      </div>

      <PaymentMethodModal
        open={isPaymentModalOpen}
        paymentMethods={paymentMethods}
        selectedId={selectedPaymentMethodId}
        onSelect={(id) => setSelectedPaymentMethodId(id)}
        onClose={() => setIsPaymentModalOpen(false)}
      />

      <CategoryPickerModal
        open={isCategoryModalOpen}
        allCategories={allCategories}
        disabled={isSubmitting}
        onSelect={(categoryId) => {
          setSelectedCategoryId(categoryId);
        }}
        onClose={() => setIsCategoryModalOpen(false)}
      />
    </main>
  );
}
