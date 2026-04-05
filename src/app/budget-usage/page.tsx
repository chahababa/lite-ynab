"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { LoadingCard } from "@/components/LoadingCard";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { fetchBudgetUsageData } from "@/lib/data";
import { getGroupTone } from "@/lib/groupTone";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { BudgetUsageData, BudgetUsageScope, ToastState } from "@/lib/types";
import { cn, formatCurrency, getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "發生未預期的錯誤";
}

export default function BudgetUsagePage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [monthId, setMonthId] = useState(() => toMonthId(getTodayInTaipei()));
  const [scope, setScope] = useState<BudgetUsageScope>("month");
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [data, setData] = useState<BudgetUsageData | null>(null);

  useEffect(() => {
    const timer = toast ? window.setTimeout(() => setToast(null), 2600) : undefined;
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [toast]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const nextData = await fetchBudgetUsageData(supabase, monthId, scope);
        if (!active) {
          return;
        }
        setData(nextData);
      } catch (error) {
        if (!active) {
          return;
        }

        const message =
          error instanceof Error && error.message === "AUTH_REQUIRED"
            ? "請先登入，才能查看預算使用儀表板。"
            : `載入預算使用儀表板失敗：${getErrorMessage(error)}`;

        setLoadError(message);
        setToast({ tone: "error", message });

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
  }, [monthId, refreshTick, router, scope, supabase]);

  function reload() {
    setRefreshTick((value) => value + 1);
  }

  return (
    <main className="min-h-screen bg-chrome-400 px-3 py-3 pb-24 font-chrome-body text-chrome-base text-chrome-900">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <section className="mx-auto w-full max-w-md space-y-4">
        <div className="chrome-window p-[6px]">
          <div className="chrome-titlebar--info px-chrome-md py-chrome-sm text-center">
            <h1 className="font-chrome-heading text-[1.5rem] font-bold text-white">預算使用儀表板</h1>
          </div>
        </div>

        <MonthSwitcher
          monthId={monthId}
          onPrevious={() => setMonthId((value) => shiftMonth(value, -1))}
          onNext={() => setMonthId((value) => shiftMonth(value, 1))}
        />

        <section className="chrome-window p-[6px]">
          <div className="chrome-titlebar flex items-center justify-between px-chrome-md py-chrome-sm">
            <h2 className="font-chrome-heading text-chrome-xl font-bold text-chrome-900">查看模式</h2>
            <p className="text-chrome-sm text-chrome-800">可切換今天或本月</p>
          </div>
          <div className="grid grid-cols-2 gap-3 px-chrome-md py-chrome-md">
            <button
              type="button"
              onClick={() => setScope("today")}
              className={cn("chrome-btn min-h-11 px-chrome-md py-chrome-md", scope === "today" && "chrome-btn--success")}
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => setScope("month")}
              className={cn("chrome-btn min-h-11 px-chrome-md py-chrome-md", scope === "month" && "chrome-btn--success")}
            >
              本月
            </button>
          </div>
        </section>

        {loading ? <LoadingCard label="正在載入預算使用狀況..." /> : null}
        {!loading && loadError ? (
          <StateCard title="載入失敗" description={loadError} tone="error" actionLabel="重試" onAction={() => void reload()} />
        ) : null}

        {!loading && !loadError && data ? (
          <>
            <section className="sticky top-3 z-20 chrome-window p-[6px]">
              <div className="grid grid-cols-3 gap-3 px-chrome-md py-chrome-md">
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">
                    {scope === "today" ? "今日已支出" : "本月已支出"}
                  </p>
                  <p className="mt-2 font-display text-chrome-2xl text-paper">{formatCurrency(data.summary.spent)}</p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">剩餘可用</p>
                  <p className={cn("mt-2 font-display text-chrome-2xl", data.summary.remaining < 0 ? "text-coral" : "text-mint")}>
                    {formatCurrency(data.summary.remaining)}
                  </p>
                </div>
                <div className="rounded-chrome-card border border-chrome-700 bg-chrome-100 px-chrome-md py-chrome-md text-center text-chrome-sm text-chrome-900 shadow-chrome-sm">
                  <p className="font-chrome-heading font-bold">超支項目</p>
                  <p className="mt-2 font-chrome-heading text-chrome-xl font-bold">{data.summary.overspentCount}</p>
                </div>
              </div>
            </section>

            {data.groups.map((group, index) => {
              const tone = getGroupTone(group.name, index);

              return (
                <section key={group.id} className="chrome-window p-[6px]">
                  <div className="chrome-titlebar flex items-center justify-between px-chrome-md py-chrome-sm">
                    <div className="flex items-center gap-3">
                      <span className={cn("chrome-chip", tone.badge)}>{group.name}</span>
                      <p className="text-chrome-sm text-chrome-800">{group.categories.length} 個小項</p>
                    </div>
                    <div className="text-right text-chrome-sm text-chrome-800">
                      <p>{scope === "today" ? "今日支出" : "本月支出"} {formatCurrency(group.spent)}</p>
                      <p>剩餘 {formatCurrency(group.remaining)}</p>
                    </div>
                  </div>

                  <div className="space-y-3 px-chrome-md py-chrome-md">
                    {group.categories.map((item) => {
                      const width = Math.max(8, Math.min(100, Math.round(item.usageRate * 100)));

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "rounded-chrome-card border border-chrome-700 bg-chrome-100 px-chrome-md py-chrome-md shadow-chrome-sm",
                            tone.item,
                            item.isOverspent && "border-coral",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words font-chrome-heading text-chrome-lg font-bold text-chrome-900">{item.name}</p>
                              <p className="mt-1 text-chrome-sm text-chrome-800">本月預算 {formatCurrency(item.allocated)}</p>
                            </div>
                            {item.isOverspent ? (
                              <span className="chrome-btn chrome-btn--danger px-chrome-sm py-1 text-xs">超支</span>
                            ) : null}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="chrome-led-panel p-chrome-md text-center">
                              <p className="text-sm uppercase tracking-[0.18em] text-paper/60">
                                {scope === "today" ? "今日支出" : "本月支出"}
                              </p>
                              <p className="mt-2 font-display text-[1.9rem] text-paper">{formatCurrency(item.spent)}</p>
                            </div>
                            <div className="chrome-led-panel p-chrome-md text-center">
                              <p className="text-sm uppercase tracking-[0.18em] text-paper/60">剩餘可用</p>
                              <p className={cn("mt-2 font-display text-[1.9rem]", item.remaining < 0 ? "text-coral" : "text-mint")}>
                                {formatCurrency(item.remaining)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 h-2 overflow-hidden rounded-chrome-pill border border-chrome-700 bg-panel-dark">
                            <div
                              className={cn(
                                "h-full transition-all duration-200",
                                item.isOverspent ? "bg-[linear-gradient(90deg,#CC6644,#BB5533)]" : "bg-led-progress",
                              )}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        ) : null}
      </section>
    </main>
  );
}
