"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Car,
  CalendarDays,
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
  Sparkles,
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
import { fetchQuickEntryData } from "@/lib/data";
import { parseHermesTransactionText } from "@/lib/hermesTransaction";
import { useLastPaymentMethod } from "@/lib/hooks/useLastPaymentMethod";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { CategoryOption, PaymentMethodOption, ToastState } from "@/lib/types";
import { cn, getTodayInTaipei, toMonthId } from "@/lib/utils";

type EntryType = "expense" | "income" | "transfer";
type QuickTemplate = {
  id: string;
  label: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  paymentMethodId: string;
  paymentMethodName: string;
  note: string;
};
type LastSavedTransaction = {
  amount: number;
  categoryName: string;
  paymentMethodName: string;
  note: string;
};
const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"] as const;
const QUICK_GRID_SIZE = 6;
const RECENT_TEMPLATE_STORAGE_KEY = "lite-ynab.quick-entry.recent-templates.v1";

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

function shiftTaipeiDate(baseDate: string, daysAgo: number) {
  const [year, month, day] = baseDate.split("-").map(Number);
  return format(new Date(year, month - 1, day - daysAgo), "yyyy-MM-dd");
}

function readRecentTemplates(): QuickTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuickTemplate[];
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
}

function saveRecentTemplates(templates: QuickTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENT_TEMPLATE_STORAGE_KEY, JSON.stringify(templates.slice(0, 4)));
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

        {/* Text / Telegram-style entry */}
        <section className="rounded-md border border-outline bg-surface p-3 shadow-elev-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1 text-title-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                文字記帳
              </p>
              <p className="text-label-sm text-on-surface-variant">例：早餐 80 現金 個人/飲食</p>
            </div>
            <button
              type="button"
              onClick={applyTextEntry}
              disabled={!textEntry.trim() || loading}
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-body-sm font-medium text-primary-on hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40"
            >
              解析
            </button>
          </div>
          <textarea
            value={textEntry}
            onChange={(event) => setTextEntry(event.target.value)}
            aria-label="文字記帳內容"
            placeholder="輸入 Telegram 風格記帳文字"
            rows={2}
            className="w-full rounded-xs border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
          />
          {parsedText ? (
            <div className="mt-2 rounded-sm bg-surface-container px-3 py-2 text-label-sm text-on-surface-variant">
              預覽：{parsedText.amount ? `$${parsedText.amount.toLocaleString("en-US")}` : "未辨識金額"} · {parsedText.categoryName ?? "未辨識分類"} · {parsedText.paymentMethodName ?? "未辨識支付方式"}
              {parsedText.warnings.length > 0 ? `｜${parsedText.warnings.join("、")}` : ""}
            </div>
          ) : null}
        </section>

        {recentTemplates.length > 0 ? (
          <section className="rounded-md bg-surface-container px-3 py-2">
            <p className="mb-2 text-label-md text-on-surface-variant">最近常用範本</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="shrink-0 rounded-full border border-outline bg-surface px-3 py-1.5 text-body-sm text-on-surface hover:bg-on-surface/[0.03] active:bg-on-surface/[0.06]"
                >
                  {template.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {lastSaved ? (
          <div className="rounded-md border border-primary bg-primary-container px-4 py-3 text-body-sm text-primary-on-container">
            <div className="flex items-start justify-between gap-3">
              <p>
                已儲存 {lastSaved.categoryName} ${lastSaved.amount.toLocaleString("en-US")}（{lastSaved.paymentMethodName}）
              </p>
              <Link href="/transactions" className="shrink-0 font-medium underline">
                編輯 / 復原
              </Link>
            </div>
            <p className="mt-1 text-label-sm opacity-75">為避免誤刪，復原走交易列表確認流程；本頁已保留最近範本可快速重記。</p>
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
        {!amount ? (
          <p className="rounded-md bg-surface-container px-4 py-2 text-center text-label-md text-on-surface-variant">
            先輸入金額，再點常用分類即可快速儲存；儲存後可從交易列表編輯 / 復原。
          </p>
        ) : null}

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
              <p>{loadError}</p>
              <button type="button" onClick={() => router.refresh()} className="mt-2 font-medium underline">
                重新整理頁面
              </button>
            </div>
          ) : visibleQuickCategories.length === 0 ? (
            <div className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
              <p>尚未標記常用分類，先到預算分配把常用小項加入快速記帳。</p>
              <Link href="/budget-allocation" className="mt-2 inline-flex font-medium text-primary underline">
                前往設定快速分類
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {visibleQuickCategories.map((category) => {
                const style = getCategoryStyle(category.name);
                const Icon = ICON_COMPONENTS[style.icon];
                const isSelected = selectedCategoryId === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleQuickCategoryTap(category.id)}
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
                    <span className="text-[8px] leading-none opacity-70">
                      #{category.groupName}
                    </span>
                    <span className="text-[10px] font-medium leading-tight">
                      {category.name}
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
          {isSubmitting ? "儲存中..." : amount ? "儲存" : "輸入金額後儲存"}
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

      {isDateSheetOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-scrim/40 px-3 pb-3" role="presentation">
          <div role="dialog" aria-modal="true" aria-label="選擇日期" className="w-full max-w-md rounded-t-[28px] bg-surface p-4 shadow-elev-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" />
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h2 className="text-title-md">選擇記帳日期</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "今天", value: getTodayInTaipei(), modified: false },
                { label: "昨天", value: shiftTaipeiDate(getTodayInTaipei(), 1), modified: true },
                { label: "前天", value: shiftTaipeiDate(getTodayInTaipei(), 2), modified: true },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => applyDate(option.value, option.modified)}
                  className="rounded-md border border-outline bg-surface-container px-3 py-3 text-body-md text-on-surface hover:bg-on-surface/[0.03] active:bg-on-surface/[0.06]"
                >
                  <span className="block font-medium">{option.label}</span>
                  <span className="mt-1 block text-label-sm text-on-surface-variant">{option.value}</span>
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-label-md text-on-surface-variant">自訂日期</span>
              <input
                value={customDateInput}
                onChange={(event) => setCustomDateInput(event.target.value)}
                placeholder="YYYY-MM-DD"
                className="h-11 w-full rounded-xs border border-outline-variant bg-surface px-3 text-center font-mono text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setIsDateSheetOpen(false)} className="h-10 rounded-full px-4 text-body-md font-medium text-primary hover:bg-primary/5 active:bg-primary/10">
                取消
              </button>
              <button type="button" onClick={applyCustomDate} className="h-10 rounded-full bg-primary px-5 text-body-md font-medium text-primary-on hover:bg-primary/90 active:bg-primary/80">
                套用
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
