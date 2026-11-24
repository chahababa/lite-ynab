"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Settings as SettingsIcon } from "lucide-react";

import { CtbcInboxShortcut } from "@/components/CtbcInboxShortcut";
import { LoadingCard } from "@/components/LoadingCard";
import { StateCard } from "@/components/StateCard";
import { fetchBudgetUsageData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { BudgetUsageData } from "@/lib/types";
import { formatMonthLabel, getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

import { MonthOverview } from "./components/MonthOverview";
import { buildMonthView } from "./helpers";

const ICON_BUTTON_CLASS =
  "flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition-colors duration-m3-short hover:bg-on-surface/5 active:bg-on-surface/10";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "發生未預期的錯誤";
}

export default function MonthPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [monthId, setMonthId] = useState(() => toMonthId(getTodayInTaipei()));
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<BudgetUsageData | null>(null);

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
        const nextData = await fetchBudgetUsageData(supabase, monthId, "month");
        if (!active) return;
        setData(nextData);
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.message === "AUTH_REQUIRED") {
          router.replace("/login");
          return;
        }
        setLoadError(`載入本月狀況失敗：${getErrorMessage(error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthId, refreshTick]);

  const view = useMemo(() => (data ? buildMonthView(data, getTodayInTaipei()) : null), [data]);

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-3 pb-[88px]">
        <CtbcInboxShortcut />

        {/* 標題列：月份切換 + 設定 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonthId((v) => shiftMonth(v, -1))}
              aria-label="上個月"
              className={ICON_BUTTON_CLASS}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="min-w-[96px] text-center text-title-md">{formatMonthLabel(monthId)}</p>
            <button
              type="button"
              onClick={() => setMonthId((v) => shiftMonth(v, 1))}
              aria-label="下個月"
              className={ICON_BUTTON_CLASS}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <Link href="/settings" aria-label="設定" className={ICON_BUTTON_CLASS}>
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </div>

        {loading ? (
          <LoadingCard label="正在載入本月狀況..." />
        ) : loadError ? (
          <StateCard
            title="載入失敗"
            description={loadError}
            tone="error"
            actionLabel="重試"
            onAction={() => setRefreshTick((v) => v + 1)}
          />
        ) : view ? (
          <MonthOverview view={view} />
        ) : null}
      </div>
    </main>
  );
}
