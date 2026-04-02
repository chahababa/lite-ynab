"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Delete } from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { Toast } from "@/components/Toast";
import { fetchQuickCategories, requireSession } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { Category, ToastState } from "@/lib/types";
import { cn, formatCurrency, getTodayInTaipei } from "@/lib/utils";

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"];

export default function QuickEntryPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [date, setDate] = useState(getTodayInTaipei());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingCategoryId, setSubmittingCategoryId] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await requireSession(supabase);
        const quickCategories = await fetchQuickCategories(supabase);

        if (!active) {
          return;
        }

        setCategories(quickCategories);
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof Error && error.message === "AUTH_REQUIRED") {
          router.replace("/login");
        } else {
          setToast({ tone: "error", message: "網路錯誤，請稍候。" });
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
  }, [router, supabase]);

  useEffect(() => {
    const timer = toast ? window.setTimeout(() => setToast(null), 2600) : undefined;
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [toast]);

  useEffect(() => {
    const timer = successFlash
      ? window.setTimeout(() => setSuccessFlash(false), 1200)
      : undefined;
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [successFlash]);

  function handleKeyPress(key: string) {
    if (key === "del") {
      setAmount((value) => value.slice(0, -1));
      return;
    }

    setAmount((value) => `${value}${key}`.replace(/^0+(?=\d)/, ""));
  }

  async function submit(categoryId: string) {
    if (!amount || Number(amount) <= 0) {
      setToast({ tone: "info", message: "請先輸入金額。" });
      return;
    }

    setSubmittingCategoryId(categoryId);

    try {
      const { error } = await supabase.from("transactions").insert({
        amount: Number(amount),
        date,
        category_id: categoryId,
        note: note.trim(),
      });

      if (error) {
        throw error;
      }

      setAmount("");
      setNote("");
      setSuccessFlash(true);
      setToast({ tone: "success", message: "記帳完成。" });
      router.refresh();
    } catch {
      setToast({ tone: "error", message: "網路錯誤，請稍候。" });
    } finally {
      setSubmittingCategoryId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-6 pt-5">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mb-5 flex items-center justify-between">
        <Link
          href="/"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink shadow-sm"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.28em] text-ink/45">Quick Entry</p>
          <p className="text-sm text-ink/65">連續記帳模式</p>
        </div>
      </div>

      <div
        className={cn(
          "rounded-[36px] bg-ink px-5 py-6 text-paper shadow-float transition",
          successFlash && "scale-[1.01] bg-mint",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-paper/60">Amount</p>
            <p className="mt-3 font-display text-5xl">
              {amount ? formatCurrency(Number(amount)) : formatCurrency(0)}
            </p>
          </div>
          {successFlash ? (
            <div className="rounded-full bg-white/15 p-3">
              <Check className="h-5 w-5" />
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {keypad.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleKeyPress(key)}
              className="rounded-2xl bg-white/10 px-4 py-4 text-lg font-medium transition hover:bg-white/15"
            >
              {key === "del" ? <Delete className="mx-auto h-5 w-5" /> : key}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3 rounded-[30px] bg-white/80 p-4 shadow-sm">
        <label className="block">
          <span className="mb-2 block text-sm text-ink/70">日期</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 outline-none focus:border-mint"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm text-ink/70">備註</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 outline-none focus:border-mint"
            placeholder="選填，例如早餐、加油、全聯"
          />
        </label>
      </div>

      <section className="mt-5 flex-1">
        <div className="mb-3 px-1">
          <p className="text-xs uppercase tracking-[0.28em] text-ink/45">Quick Categories</p>
          <h2 className="font-display text-2xl text-ink">點一下就送出</h2>
        </div>
        {loading ? (
          <LoadingCard />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                disabled={submittingCategoryId !== null}
                onClick={() => void submit(category.id)}
                className={cn(
                  "rounded-[26px] px-4 py-5 text-left shadow-sm transition",
                  submittingCategoryId === category.id
                    ? "bg-mint text-white"
                    : "bg-white/85 text-ink hover:-translate-y-0.5",
                )}
              >
                <p className="font-medium">{category.name}</p>
                <p className="mt-2 text-sm opacity-70">
                  {submittingCategoryId === category.id ? "送出中..." : "記這一筆"}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
