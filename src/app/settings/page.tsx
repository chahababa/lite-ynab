"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  DatabaseZap,
  LogOut,
  ReceiptText,
  Sparkles,
  WalletCards,
} from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { StateCard } from "@/components/StateCard";
import { fetchSettingsData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { SettingsOverview } from "@/lib/types";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
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
      if (!session?.user) router.replace("/login");
    });
    return () => subscription.unsubscribe();
  }, [router, supabase]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchSettingsData(supabase);
        if (!active) return;
        setEmail(data.user.email ?? "");
        setOverview(data.overview);
      } catch (error) {
        if (!active) return;
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
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const SHORTCUTS = [
    { href: "/", icon: Sparkles, label: "主控臺", desc: "查看預算與最近交易" },
    { href: "/quick-entry", icon: ReceiptText, label: "快速記帳", desc: "立即新增一筆支出" },
    { href: "/budget-allocation", icon: WalletCards, label: "預算分配", desc: "調整本月各分類配置" },
    { href: "/settings/ynab-import", icon: DatabaseZap, label: "匯入 YNAB", desc: "匯入歷史資料" },
  ];

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4 pb-[88px]">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="返回主控臺"
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <p className="text-title-md">設定</p>
          <span className="w-10" />
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
            {/* Account card */}
            <div className="rounded-md border border-outline bg-surface p-4">
              <p className="text-label-md text-on-surface-variant">帳號</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-body-md text-on-surface">{email || "—"}</p>
                <button
                  type="button"
                  onClick={() => {
                    void supabase.auth.signOut().then(() => {
                      router.replace("/login");
                      router.refresh();
                    });
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-outline px-3 py-1.5 text-body-sm text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
                >
                  <LogOut className="h-4 w-4" />
                  登出
                </button>
              </div>
            </div>

            {/* Overview cards */}
            <section>
              <h2 className="mb-3 text-title-md">系統概覽</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-outline bg-surface p-4">
                  <p className="text-label-md text-on-surface-variant">大項分類</p>
                  <p className="mt-1 font-mono text-num-display font-medium tabular-nums">
                    {overview.groupCount}
                  </p>
                </div>
                <div className="rounded-md border border-outline bg-surface p-4">
                  <p className="text-label-md text-on-surface-variant">小項分類</p>
                  <p className="mt-1 font-mono text-num-display font-medium tabular-nums">
                    {overview.categoryCount}
                  </p>
                </div>
                <div className="rounded-md border border-outline bg-surface p-4">
                  <p className="text-label-md text-on-surface-variant">快速記帳</p>
                  <p className="mt-1 font-mono text-num-display font-medium tabular-nums">
                    {overview.quickCategoryCount}
                  </p>
                </div>
                <div className="rounded-md border border-outline bg-surface p-4">
                  <p className="text-label-md text-on-surface-variant">支付方式</p>
                  <p className="mt-1 font-mono text-num-display font-medium tabular-nums">
                    {overview.paymentMethodCount}
                  </p>
                </div>
              </div>
            </section>

            {/* Shortcuts */}
            <section>
              <h2 className="mb-3 text-title-md">常用入口</h2>
              <div className="rounded-md border border-outline bg-surface">
                {SHORTCUTS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      className={`flex items-center gap-3 px-5 py-4 text-on-surface transition-colors duration-m3-short hover:bg-on-surface/5 active:bg-on-surface/10 ${i > 0 ? "border-t border-outline" : ""}`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-primary-on-container">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-body-md font-medium">{s.label}</p>
                        <p className="text-body-sm text-on-surface-variant">{s.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-on-surface-variant" />
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
