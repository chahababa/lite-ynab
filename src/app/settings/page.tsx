"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ReceiptText, Settings2, Sparkles, WalletCards } from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { StateCard } from "@/components/StateCard";
import { fetchSettingsData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { SettingsOverview } from "@/lib/types";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return "發生未知錯誤";
    }
  }

  return "發生未知錯誤";
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [email, setEmail] = useState("");
  const [overview, setOverview] = useState<SettingsOverview>({
    groupCount: 0,
    categoryCount: 0,
    quickCategoryCount: 0,
    paymentMethodCount: 0,
  });

  const reload = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

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
        const data = await fetchSettingsData(supabase);

        if (!active) {
          return;
        }

        setEmail(data.user.email ?? "");
        setOverview(data.overview);
      } catch (error) {
        if (!active) {
          return;
        }

        const detail = getErrorMessage(error);
        const message =
          error instanceof Error && error.message === "AUTH_REQUIRED"
            ? "你尚未登入，請先登入後再查看這一頁。"
            : `設定頁載入失敗：${detail}`;

        setLoadError(message);

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
  }, [refreshTick, router, supabase]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-5">
      <div className="mb-5 flex items-center justify-between">
        <Link
          href="/"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink shadow-sm"
          aria-label="返回首頁"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.28em] text-ink/45">設定與說明</p>
          <p className="text-sm text-ink/65">{email || "尚未載入使用者"}</p>
        </div>
      </div>

      {loading ? (
        <LoadingCard label="正在載入設定說明..." />
      ) : loadError ? (
        <StateCard
          title="設定頁暫時無法載入"
          description={loadError}
          tone="error"
          actionLabel="重試"
          onAction={reload}
        />
      ) : (
        <>
          <section className="rounded-[32px] bg-white/85 p-5 shadow-float backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-ink/45">目前設計方向</p>
                <h1 className="mt-2 font-display text-3xl text-ink">這頁先保留為說明中心</h1>
                <p className="mt-2 text-sm leading-6 text-ink/65">
                  依照目前的操作習慣，快速記帳和支付方式管理已經整合回首頁。這一頁先當作整理導覽與之後的進階設定預留區。
                </p>
              </div>
              <div className="rounded-full bg-sun/18 p-3 text-ink">
                <Settings2 className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[24px] bg-paper p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">大項分類</p>
                <p className="mt-2 font-display text-3xl text-ink">{overview.groupCount}</p>
              </div>
              <div className="rounded-[24px] bg-paper p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">小項分類</p>
                <p className="mt-2 font-display text-3xl text-ink">{overview.categoryCount}</p>
              </div>
              <div className="rounded-[24px] bg-paper p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">快速記帳</p>
                <p className="mt-2 font-display text-3xl text-ink">{overview.quickCategoryCount}</p>
              </div>
              <div className="rounded-[24px] bg-paper p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">支付方式</p>
                <p className="mt-2 font-display text-3xl text-ink">{overview.paymentMethodCount}</p>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[30px] border border-ink/10 bg-white/80 p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.28em] text-ink/45">目前操作位置</p>
              <h2 className="mt-2 font-display text-2xl text-ink">常用功能已回到主流程</h2>
            </div>

            <div className="space-y-3">
              <Link
                href="/"
                className="flex items-center gap-3 rounded-[24px] bg-paper px-4 py-4 text-ink"
              >
                <Sparkles className="h-5 w-5" />
                <span>首頁：管理快速記帳與支付方式</span>
              </Link>
              <Link
                href="/quick-entry"
                className="flex items-center gap-3 rounded-[24px] bg-paper px-4 py-4 text-ink"
              >
                <ReceiptText className="h-5 w-5" />
                <span>快速記帳頁：適合手機捷徑直接開啟</span>
              </Link>
              <Link
                href="/budget-allocation"
                className="flex items-center gap-3 rounded-[24px] bg-paper px-4 py-4 text-ink"
              >
                <WalletCards className="h-5 w-5" />
                <span>預算分配頁：月初規劃收入與各項預算</span>
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
