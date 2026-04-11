"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Delete, Search, WalletCards } from "lucide-react";

import { Toast } from "@/components/Toast";
import { fetchQuickEntryData } from "@/lib/data";
import { getGroupTone } from "@/lib/groupTone";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { CategoryOption, PaymentMethodOption, ToastState } from "@/lib/types";
import { cn, formatCurrency, getTodayInTaipei, toMonthId } from "@/lib/utils";

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"];

type CategoryMode = "quick" | "all";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "載入快速記帳資料時發生未預期的錯誤。";
}

export default function QuickEntryPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [quickCategories, setQuickCategories] = useState<CategoryOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [date, setDate] = useState(getTodayInTaipei());
  const currentMonthId = useMemo(() => toMonthId(date), [date]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submittingCategoryId, setSubmittingCategoryId] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("quick");
  const [categoryQuery, setCategoryQuery] = useState("");

  useEffect(() => {
    const timer = toast ? window.setTimeout(() => setToast(null), 2600) : undefined;
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [toast]);

  useEffect(() => {
    const timer = successFlash ? window.setTimeout(() => setSuccessFlash(false), 1000) : undefined;
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [successFlash]);

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
        setSelectedPaymentMethodId((current) => current || data.paymentMethods[0]?.id || "");
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
  }, [currentMonthId, router, supabase]);

  function handleKeyPress(key: string) {
    if (key === "del") {
      setAmount((value) => value.slice(0, -1));
      return;
    }

    setAmount((value) => `${value}${key}`.replace(/^0+(?=\d)/, ""));
  }

  async function submit(categoryId: string) {
    if (!amount || Number(amount) <= 0) {
      setToast({ tone: "info", message: "請輸入大於 0 的金額" });
      return;
    }

    if (!selectedPaymentMethodId) {
      setToast({ tone: "info", message: "請先選擇支付方式。" });
      return;
    }

    const category =
      allCategories.find((item) => item.id === categoryId) ??
      quickCategories.find((item) => item.id === categoryId);

    setSubmittingCategoryId(categoryId);

    try {
      const nextAmount = Number(amount);
      const { error } = await supabase.from("transactions").insert({
        amount: nextAmount,
        date,
        category_id: categoryId,
        payment_method_id: selectedPaymentMethodId,
        note: note.trim(),
      });

      if (error) throw error;

      setAmount("");
      setNote("");
      setSuccessFlash(true);
      setToast({
        tone: "success",
        message: `已記帳 ${formatCurrency(nextAmount)} 至 ${category?.name ?? "未命名分類"}`,
      });
      router.refresh();
    } catch {
      setToast({ tone: "error", message: "記帳失敗，請稍後再試。" });
    } finally {
      setSubmittingCategoryId(null);
    }
  }

  const visibleCategories = (categoryMode === "quick" ? quickCategories : allCategories).filter(
    (category) => {
      const query = categoryQuery.trim().toLowerCase();
      if (!query) return true;
      return `${category.groupName} ${category.name}`.toLowerCase().includes(query);
    },
  );

  const groupToneMap = useMemo(() => {
    const uniqueGroupNames = Array.from(new Set(allCategories.map((category) => category.groupName)));

    return new Map(
      uniqueGroupNames.map((groupName, index) => [groupName, getGroupTone(groupName, index)]),
    );
  }, [allCategories]);

  return (
    <main className="box-border min-h-screen bg-chrome-400 px-3 py-3 pb-[88px] font-chrome-body text-chrome-base text-chrome-900">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mx-auto w-full max-w-md chrome-window p-[6px]">
        <div className="chrome-titlebar flex items-center justify-between gap-3 px-chrome-md py-chrome-sm">
          <div>
            <p className="font-chrome-heading text-chrome-sm font-bold tracking-chrome-wider text-chrome-900">
              快速記帳
            </p>
            <p className="text-chrome-sm text-chrome-800">用最短路徑完成一筆支出記錄</p>
          </div>

          <div className="chrome-statusbar px-chrome-sm py-[3px] text-chrome-xs font-bold tracking-chrome-wide text-chrome-800">
            {date}
          </div>
        </div>

        <div className="mt-chrome-md space-y-chrome-md">
          <section className="chrome-led-panel relative px-chrome-lg py-chrome-xl">
            <div className="flex flex-col items-center justify-center text-center">
              <div>
                <p className="chrome-led-label text-chrome-sm uppercase">金額</p>
                <p className="chrome-led-value mt-2 text-[2.35rem] leading-none">
                  {amount ? formatCurrency(Number(amount)) : formatCurrency(0)}
                </p>
              </div>
            </div>

            {successFlash ? (
              <div className="chrome-led-accent absolute right-chrome-md top-chrome-md rounded-chrome-pill border border-chrome-700 bg-primary/70 px-chrome-md py-chrome-sm font-chrome-mono text-chrome-sm font-bold uppercase tracking-chrome-wide">
                <Check className="h-4 w-4" />
              </div>
            ) : null}

            <div className="mt-chrome-lg grid grid-cols-3 gap-chrome-md">
              {keypad.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKeyPress(key)}
                  className="chrome-btn flex min-h-11 items-center justify-center px-chrome-md py-chrome-lg font-chrome-heading text-chrome-xl font-bold tracking-chrome-wide"
                >
                  {key === "del" ? <Delete className="h-4 w-4" /> : key}
                </button>
              ))}
            </div>
          </section>

          <section className="chrome-window p-chrome-md">
            <div className="chrome-titlebar px-chrome-md py-chrome-sm">
              <p className="font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-900">
                欄位資訊
              </p>
            </div>

            <div className="mt-chrome-md space-y-chrome-md">
              <label className="block">
                <span className="mb-chrome-sm block font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                  日期
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                />
              </label>

              <div className="block">
                <span className="mb-chrome-sm flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                  <WalletCards className="h-4 w-4" />
                  支付方式
                </span>
                <div className="grid grid-cols-2 gap-chrome-sm">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPaymentMethodId(method.id)}
                      className={cn(
                        "chrome-btn min-h-11 px-chrome-md py-chrome-md text-chrome-sm font-bold tracking-chrome-wide",
                        selectedPaymentMethodId === method.id && "chrome-btn--success text-white",
                      )}
                    >
                      {method.name}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-chrome-sm block font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                  備註
                </span>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                  placeholder="例如：超商早餐、飲料、買菜"
                />
              </label>
            </div>
          </section>

          <section className="chrome-window p-chrome-md">
            <div className="chrome-titlebar px-chrome-md py-chrome-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-900">
                  分類選擇器
                </p>
                <div className="chrome-statusbar px-chrome-sm py-[3px] text-chrome-xs font-bold tracking-chrome-wide text-chrome-800">
                  {categoryMode === "quick" ? "快速" : "全部"}
                </div>
              </div>
            </div>

            <div className="mt-chrome-md grid grid-cols-2 gap-chrome-sm">
              <button
                type="button"
                onClick={() => setCategoryMode("quick")}
                className={cn(
                  "chrome-btn min-h-11 px-chrome-md py-chrome-md text-chrome-sm font-bold tracking-chrome-wide",
                  categoryMode === "quick" && "chrome-btn--success text-white",
                )}
              >
                快速
              </button>
              <button
                type="button"
                onClick={() => setCategoryMode("all")}
                className={cn(
                  "chrome-btn min-h-11 px-chrome-md py-chrome-md text-chrome-sm font-bold tracking-chrome-wide",
                  categoryMode === "all" && "chrome-btn--success text-white",
                )}
              >
                全部分類
              </button>
            </div>

            <label className="mt-chrome-md block">
              <span className="mb-chrome-sm flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                <Search className="h-4 w-4" />
                搜尋
              </span>
              <input
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                placeholder="搜尋分類名稱或群組"
              />
            </label>

            <div className="mt-chrome-md">
              {loading ? (
                <div className="chrome-led-panel px-chrome-md py-chrome-lg">
                  <p className="chrome-led-label text-chrome-sm uppercase">載入中</p>
                  <p className="chrome-led-value mt-2 text-chrome-xl">正在準備分類資料...</p>
                </div>
              ) : loadError ? (
                <div className="chrome-led-panel px-chrome-md py-chrome-lg">
                  <p className="chrome-led-label text-chrome-sm uppercase">錯誤</p>
                  <p className="mt-2 font-chrome-mono text-chrome-base text-danger-light">{loadError}</p>
                </div>
              ) : visibleCategories.length === 0 ? (
                <div className="chrome-led-panel px-chrome-md py-chrome-lg">
                  <p className="chrome-led-label text-chrome-sm uppercase">沒有結果</p>
                  <p className="mt-2 font-chrome-mono text-chrome-base text-chrome-300">
                    {categoryQuery.trim()
                      ? "找不到符合搜尋條件的分類。"
                      : categoryMode === "quick"
                        ? "目前沒有已加入快速記帳的分類。"
                        : "目前沒有任何分類。"}
                  </p>
                </div>
              ) : (
                <div className="max-h-[340px] space-y-chrome-sm overflow-y-auto pr-1">
                  {visibleCategories.map((category) => {
                    const tone = groupToneMap.get(category.groupName) ?? getGroupTone(category.groupName);

                    return (
                      <button
                        key={category.id}
                        type="button"
                        disabled={submittingCategoryId !== null}
                        onClick={() => void submit(category.id)}
                        className={cn(
                          "chrome-btn flex min-h-[92px] w-full items-stretch justify-between overflow-hidden p-0 text-left",
                          submittingCategoryId === category.id &&
                            "chrome-btn--success translate-y-[1px] text-white",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center justify-center px-chrome-md py-chrome-md">
                          <div className="min-w-0 text-center">
                            <p
                              className={cn(
                                "inline-flex min-w-[72px] items-center justify-center rounded-chrome-pill border px-2 py-[2px] font-chrome-heading text-chrome-xs font-bold tracking-chrome-wide",
                                submittingCategoryId === category.id
                                  ? "border-white/40 bg-white/15 text-white"
                                  : tone.badge,
                              )}
                            >
                              {category.groupName}
                            </p>
                            <p className="mt-2 truncate font-chrome-heading text-chrome-lg font-bold text-chrome-900">
                              {category.name}
                            </p>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "chrome-led-panel flex min-w-[120px] shrink-0 self-stretch rounded-none border-l-2 border-y-0 border-r-0 flex-col items-center justify-center px-chrome-sm py-[6px] text-center",
                            tone.panel,
                          )}
                        >
                          <p className="chrome-led-label text-chrome-xs uppercase">
                            {submittingCategoryId === category.id ? "儲存中" : "送出"}
                          </p>
                          <p className="chrome-led-value text-chrome-lg">
                            {amount ? formatCurrency(Number(amount)) : formatCurrency(0)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <div className="chrome-statusbar flex items-center justify-between gap-3 px-chrome-md py-chrome-sm">
            <span className="font-chrome-heading text-chrome-xs font-bold tracking-chrome-wide text-chrome-800">
              快速記帳模式
            </span>
            <span className="font-chrome-mono text-chrome-xs text-chrome-800">
              金額輸入後直接點分類即可送出
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
