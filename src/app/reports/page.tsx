"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Download, FileSpreadsheet } from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { fetchReportsData } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { ReportData, ToastState } from "@/lib/types";
import { cn, formatCurrency, getTodayInTaipei, shiftMonth, toMonthId } from "@/lib/utils";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "發生未預期的錯誤";
}

function csvCell(value: string | number) {
  const content = String(value).replace(/"/g, '""');
  return `"${content}"`;
}

function createCsvContent(data: ReportData) {
  const rows: Array<Array<string | number>> = [
    ["報表區間", `${data.period.startMonthId} ~ ${data.period.endMonthId}`],
    ["比較區間", `${data.period.previousStartMonthId} ~ ${data.period.previousEndMonthId}`],
    ["收入", data.summary.income],
    ["已分配", data.summary.allocated],
    ["已支出", data.summary.spent],
    ["尚可分配", data.summary.unallocated],
    ["與上期差異", data.summary.deltaSpent],
    [],
    ["月份趨勢"],
    ["月份", "收入", "已分配", "已支出", "尚可分配"],
    ...data.trend.map((item) => [item.label, item.income, item.allocated, item.spent, item.unallocated]),
    [],
    ["細項分類"],
    ["分類", "已分配", "已支出", "剩餘", "上期支出", "差異", "交易筆數"],
    ...data.categories.map((item) => [item.name, item.allocated, item.spent, item.remaining, item.previousSpent, item.deltaSpent, item.transactionCount]),
    [],
    ["支付方式"],
    ["支付方式", "已支出", "占比", "上期支出", "差異", "交易筆數"],
    ...data.paymentMethods.map((item) => [item.name, item.spent, `${Math.round(item.share * 100)}%`, item.previousSpent, item.deltaSpent, item.transactionCount]),
  ];

  return "\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function createExcelContent(data: ReportData) {
  const renderRows = (rows: Array<Array<string | number>>) =>
    rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell) => `<td style="border:1px solid #666;padding:8px;">${String(cell)}</td>`)
            .join("")}</tr>`,
      )
      .join("");

  return `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table>${renderRows([
          ["報表區間", `${data.period.startMonthId} ~ ${data.period.endMonthId}`],
          ["收入", data.summary.income],
          ["已分配", data.summary.allocated],
          ["已支出", data.summary.spent],
          ["尚可分配", data.summary.unallocated],
        ])}</table>
      </body>
    </html>
  `;
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [monthId, setMonthId] = useState(() => toMonthId(getTodayInTaipei()));
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    const timer = toast ? window.setTimeout(() => setToast(null), 2600) : undefined;
    return () => {
      if (timer) window.clearTimeout(timer);
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
        const reportData = await fetchReportsData(supabase, monthId);
        if (!active) return;
        setData(reportData);
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error && error.message === "AUTH_REQUIRED"
            ? "請先登入，才能查看報表。"
            : `載入報表失敗：${getErrorMessage(error)}`;
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
  }, [monthId, refreshTick, router, supabase]);

  function reload() {
    setRefreshTick((value) => value + 1);
  }

  function exportCsv() {
    if (!data) return;
    downloadBlob(createCsvContent(data), `reports-${monthId}.csv`, "text/csv;charset=utf-8;");
    setToast({ tone: "success", message: "報表 CSV 已匯出。" });
  }

  function exportExcel() {
    if (!data) return;
    downloadBlob(createExcelContent(data), `reports-${monthId}.xls`, "application/vnd.ms-excel;charset=utf-8;");
    setToast({ tone: "success", message: "報表 Excel 已匯出。" });
  }

  return (
    <main className="min-h-screen bg-chrome-400 px-3 py-3 pb-24 font-chrome-body text-chrome-base text-chrome-900">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <section className="mx-auto w-full max-w-md space-y-4">
        <div className="chrome-window p-[6px]">
          <div className="chrome-titlebar--info px-chrome-md py-chrome-sm text-center">
            <h1 className="font-chrome-heading text-[1.5rem] font-bold text-white">
              報表分析
            </h1>
          </div>
        </div>

        <MonthSwitcher
          monthId={monthId}
          onPrevious={() => setMonthId((value) => shiftMonth(value, -1))}
          onNext={() => setMonthId((value) => shiftMonth(value, 1))}
        />

        {loading ? (
          <LoadingCard label="正在載入報表資料..." />
        ) : loadError ? (
          <StateCard title="載入報表失敗" description={loadError} tone="error" actionLabel="重試" onAction={reload} />
        ) : data ? (
          <>
            <section className="chrome-window p-[6px]">
              <div className="flex justify-end gap-2 px-chrome-md pb-chrome-md pt-4">
                <button type="button" onClick={exportCsv} className="chrome-btn flex items-center gap-2 px-chrome-md py-chrome-sm text-chrome-sm">
                  <Download className="h-4 w-4" />CSV
                </button>
                <button type="button" onClick={exportExcel} className="chrome-btn flex items-center gap-2 px-chrome-md py-chrome-sm text-chrome-sm">
                  <FileSpreadsheet className="h-4 w-4" />Excel
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 px-chrome-md pb-chrome-md">
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-xs uppercase tracking-[0.26em] text-paper/60">收入</p>
                  <p className="mt-2 font-display text-3xl text-paper">{formatCurrency(data.summary.income)}</p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-xs uppercase tracking-[0.26em] text-paper/60">已支出</p>
                  <p className="mt-2 font-display text-3xl text-mint">{formatCurrency(data.summary.spent)}</p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-xs uppercase tracking-[0.26em] text-paper/60">已分配</p>
                  <p className="mt-2 font-display text-3xl text-paper">{formatCurrency(data.summary.allocated)}</p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-xs uppercase tracking-[0.26em] text-paper/60">尚可分配</p>
                  <p className={cn("mt-2 font-display text-3xl", data.summary.unallocated < 0 ? "text-coral" : "text-mint")}>
                    {formatCurrency(data.summary.unallocated)}
                  </p>
                </div>
              </div>
            </section>

            <section className="chrome-window p-[6px]">
              <div className="chrome-titlebar flex items-center gap-2 px-chrome-md py-chrome-sm">
                <BarChart3 className="h-4 w-4" />
                <h2 className="font-chrome-heading text-chrome-xl font-bold text-chrome-900">細項支出總覽</h2>
              </div>
              <div className="space-y-2 px-chrome-md py-chrome-md">
                {data.categories.map((item) => (
                  <div key={item.id} className="rounded-chrome-card border border-chrome-700 bg-chrome-100 px-chrome-md py-chrome-sm shadow-chrome-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-chrome-heading text-chrome-base font-bold text-chrome-900">{item.name}</p>
                        <p className="mt-1 text-chrome-sm text-chrome-800">交易 {item.transactionCount} 筆</p>
                      </div>
                      <div className="text-right text-chrome-sm">
                        <p className="text-chrome-800">預算 {formatCurrency(item.allocated)}</p>
                        <p className="font-bold text-chrome-900">支出 {formatCurrency(item.spent)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="chrome-window p-[6px]">
              <div className="chrome-titlebar px-chrome-md py-chrome-sm">
                <h2 className="font-chrome-heading text-chrome-xl font-bold text-chrome-900">支付方式</h2>
              </div>
              <div className="space-y-2 px-chrome-md py-chrome-md">
                {data.paymentMethods.map((item) => (
                  <div key={item.id} className="rounded-chrome-card border border-chrome-700 bg-chrome-100 px-chrome-md py-chrome-sm shadow-chrome-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-chrome-heading text-chrome-base font-bold text-chrome-900">{item.name}</p>
                      <div className="text-right text-chrome-sm">
                        <p className="font-bold text-chrome-900">{formatCurrency(item.spent)}</p>
                        <p className="text-chrome-800">占比 {Math.round(item.share * 100)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
