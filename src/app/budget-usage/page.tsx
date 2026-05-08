"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Car,
  ChevronLeft,
  ChevronRight,
  Coffee,
  CreditCard,
  Heart,
  Home,
  Music,
  Plane,
  ShoppingBag,
  Tag,
  Utensils,
} from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { Chip as M3Chip } from "@/components/m3/Chip";
import { MoneyText } from "@/components/m3/MoneyText";
import { Progress } from "@/components/m3/Progress";
import {
  CAT_BG_CLASS,
  CAT_TEXT_CLASS,
  type M3CatIcon,
  getCategoryStyle,
} from "@/lib/categoryStyle";
import {
  getAmbiguousCategoryNames,
  getCategoryDisplay,
} from "@/lib/categoryDisplay";
import { fetchBudgetUsageData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { BudgetUsageData, BudgetUsageScope, ToastState } from "@/lib/types";
import { cn, formatMonthLabel, getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

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
  if (error instanceof Error && error.message) return error.message;
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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
        const nextData = await fetchBudgetUsageData(supabase, monthId, scope);
        if (!active) return;
        setData(nextData);
      } catch (error) {
        if (!active) return;
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
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthId, scope, refreshTick]);

  function reload() {
    setRefreshTick((v) => v + 1);
  }

  // Flatten groups → category list, sort by usageRate desc (over-budget first)
  const allItems = useMemo(() => {
    if (!data) return [];
    return data.groups
      .flatMap((g) => g.categories)
      .sort((a, b) => b.usageRate - a.usageRate);
  }, [data]);

  const totalAllocated = useMemo(
    () => (data ? data.groups.reduce((s, g) => s + g.allocated, 0) : 0),
    [data],
  );

  const ambiguousNames = useMemo(
    () => getAmbiguousCategoryNames(allItems),
    [allItems],
  );

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4 pb-[88px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label-md text-on-surface-variant">預算使用</p>
            <p className="text-headline-sm">{formatMonthLabel(monthId)}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonthId((v) => shiftMonth(v, -1))}
              aria-label="上個月"
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setMonthId((v) => shiftMonth(v, 1))}
              aria-label="下個月"
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scope toggle */}
        <div className="flex gap-2">
          <M3Chip selected={scope === "month"} onClick={() => setScope("month")}>
            本月
          </M3Chip>
          <M3Chip selected={scope === "today"} onClick={() => setScope("today")}>
            今天
          </M3Chip>
        </div>

        {loading ? (
          <LoadingCard label="正在載入預算使用狀況..." />
        ) : loadError ? (
          <StateCard
            title="載入失敗"
            description={loadError}
            tone="error"
            actionLabel="重試"
            onAction={reload}
          />
        ) : data ? (
          <>
            {/* 4 Summary cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-outline bg-surface p-4">
                <p className="text-label-md text-on-surface-variant">總預算</p>
                <div className="mt-1">
                  <MoneyText value={totalAllocated} size="display" prefix={false} />
                </div>
              </div>
              <div className="rounded-md border border-outline bg-surface p-4">
                <p className="text-label-md text-on-surface-variant">
                  {scope === "today" ? "今日已支出" : "本月已支出"}
                </p>
                <div className="mt-1">
                  <MoneyText
                    value={data.summary.spent}
                    type="expense"
                    size="display"
                    prefix={false}
                  />
                </div>
              </div>
              <div className="rounded-md border border-outline bg-surface p-4">
                <p className="text-label-md text-on-surface-variant">剩餘</p>
                <div className="mt-1">
                  <MoneyText
                    value={data.summary.remaining}
                    type={data.summary.remaining < 0 ? "warn" : "remain"}
                    size="display"
                    prefix={false}
                  />
                </div>
              </div>
              <div className="rounded-md border border-outline bg-surface p-4">
                <p className="text-label-md text-on-surface-variant">超支類別</p>
                <p
                  className={cn(
                    "mt-1 font-mono tabular-nums text-num-display font-medium",
                    data.summary.overspentCount > 0
                      ? "text-money-warn"
                      : "text-on-surface",
                  )}
                >
                  {data.summary.overspentCount}
                </p>
              </div>
            </div>

            {/* Overspent banner */}
            {data.summary.overspentCount > 0 ? (
              <div className="flex items-center gap-3 rounded-md bg-money-warn-container p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-money-warn text-white">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body-md font-medium text-on-surface">
                    {data.summary.overspentCount} 個類別超支
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    建議調整預算或控制本月剩餘消費
                  </p>
                </div>
              </div>
            ) : null}

            {/* Category list */}
            <section>
              <h2 className="mb-3 text-title-md">類別明細</h2>
              {allItems.length === 0 ? (
                <p className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
                  本月尚未設定預算分配
                </p>
              ) : (
                <div className="rounded-md border border-outline bg-surface">
                  {allItems.map((item, i) => {
                    const style = getCategoryStyle(item.name);
                    const Icon = ICON_COMPONENTS[style.icon];
                    const pct =
                      item.allocated > 0
                        ? Math.min(
                            999,
                            Math.round((item.spent / item.allocated) * 100),
                          )
                        : 0;
                    const display = getCategoryDisplay(item, ambiguousNames);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "px-5 py-4",
                          i > 0 && "border-t border-outline",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
                              `${CAT_BG_CLASS[style.color]}/15`,
                              CAT_TEXT_CLASS[style.color],
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-body-md font-medium text-on-surface">
                              {display.secondary ? (
                                <span className="text-label-sm font-normal text-on-surface-variant">
                                  {display.secondary} ·{" "}
                                </span>
                              ) : null}
                              {display.primary}
                            </p>
                            <p className="text-label-sm text-on-surface-variant">
                              {item.isOverspent
                                ? `超支 $${Math.abs(item.remaining).toLocaleString("en-US")}`
                                : `還剩 $${item.remaining.toLocaleString("en-US")}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <MoneyText
                              value={item.spent}
                              type={item.isOverspent ? "expense" : "neutral"}
                              size="title"
                              prefix={false}
                            />
                            <p className="font-mono tabular-nums text-label-sm text-on-surface-variant">
                              / ${item.allocated.toLocaleString("en-US")}
                            </p>
                          </div>
                        </div>
                        <Progress
                          value={Math.min(100, pct)}
                          variant={item.isOverspent ? "expense" : "primary"}
                          className="mt-3"
                          ariaLabel={`${item.name} 預算使用 ${pct}%`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
