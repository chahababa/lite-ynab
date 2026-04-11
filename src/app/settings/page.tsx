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
      return "發生未預期的錯誤";
    }
  }

  return "發生未預期的錯誤";
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
            ? "請先登入，才能查看設定。"
            : `載入設定失敗：${detail}`;

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
    <main className="box-border min-h-screen bg-chrome-400 px-3 py-3 pb-[88px] font-chrome-body text-chrome-base text-chrome-900">
      <section className="mx-auto w-full max-w-md space-y-4">
        <div className="chrome-window p-[6px]">
          <div className="chrome-titlebar flex items-center justify-between gap-3 px-chrome-md py-chrome-sm">
            <Link
              href="/"
              className="chrome-btn flex h-10 w-10 items-center justify-center"
              aria-label="返回主控臺"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="text-right">
              <p className="font-chrome-heading text-chrome-xs font-bold tracking-[0.16em] text-chrome-800">
                設定
              </p>
              <p className="text-chrome-sm text-chrome-800">{email || "尚未載入"}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <LoadingCard label="正在載入設定資料..." />
        ) : loadError ? (
          <StateCard
            title="載入設定失敗"
            description={loadError}
            tone="error"
            actionLabel="重試"
            onAction={reload}
          />
        ) : (
          <>
            <section className="chrome-window p-[6px]">
              <div className="chrome-titlebar px-chrome-md py-chrome-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-chrome-heading text-chrome-xs font-bold tracking-[0.16em] text-chrome-800">
                      系統概覽
                    </p>
                    <h1 className="mt-2 font-chrome-heading text-chrome-2xl font-bold text-chrome-900">
                      目前的帳務骨架
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-chrome-800">
                      這裡集中顯示分類、快速記帳與支付方式的整體數量，方便我們確認資料結構是否完整。
                    </p>
                  </div>
                  <div className="chrome-btn flex h-11 w-11 items-center justify-center">
                    <Settings2 className="h-5 w-5" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 px-chrome-md py-chrome-md">
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">大項分類</p>
                  <p className="mt-2 font-display text-3xl text-paper">{overview.groupCount}</p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">小項分類</p>
                  <p className="mt-2 font-display text-3xl text-paper">{overview.categoryCount}</p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">快速記帳</p>
                  <p className="mt-2 font-display text-3xl text-paper">
                    {overview.quickCategoryCount}
                  </p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">支付方式</p>
                  <p className="mt-2 font-display text-3xl text-paper">
                    {overview.paymentMethodCount}
                  </p>
                </div>
              </div>
            </section>

            <section className="chrome-window p-[6px]">
              <div className="chrome-titlebar px-chrome-md py-chrome-sm">
                <div>
                  <p className="font-chrome-heading text-chrome-xs font-bold tracking-[0.16em] text-chrome-800">
                    常用入口
                  </p>
                  <h2 className="mt-2 font-chrome-heading text-chrome-xl font-bold text-chrome-900">
                    從設定回到主要工作流
                  </h2>
                </div>
              </div>

              <div className="space-y-3 px-chrome-md py-chrome-md">
                <Link href="/" className="chrome-btn flex min-h-12 items-center gap-3 px-4 py-3">
                  <Sparkles className="h-5 w-5" />
                  <span>回主控臺查看預算與最近交易</span>
                </Link>
                <Link
                  href="/quick-entry"
                  className="chrome-btn flex min-h-12 items-center gap-3 px-4 py-3"
                >
                  <ReceiptText className="h-5 w-5" />
                  <span>前往快速記帳，立即新增一筆支出</span>
                </Link>
                <Link
                  href="/budget-allocation"
                  className="chrome-btn flex min-h-12 items-center gap-3 px-4 py-3"
                >
                  <WalletCards className="h-5 w-5" />
                  <span>前往預算分配，調整本月各分類配置</span>
                </Link>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
