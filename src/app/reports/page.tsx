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
    <main className="min-h-screen bg-background px-4 py-4 pb-[88px] font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <section className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label-md text-on-surface-variant">報表分析</p>
            <p className="text-headline-sm">支出與分類概覽</p>
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
            {/* Export buttons */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-outline-variant bg-transparent px-4 text-body-sm text-primary transition-colors duration-m3-short hover:bg-primary/5 active:bg-primary/10"
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-outline-variant bg-transparent px-4 text-body-sm text-primary transition-colors duration-m3-short hover:bg-primary/5 active:bg-primary/10"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
            </div>

            {/* 4 summary cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-money-income-container p-4">
                <p className="text-label-md text-on-surface-variant">收入</p>
                <p className="mt-1 font-mono text-num-display font-medium text-money-income tabular-nums">
                  ${data.summary.income.toLocaleString("en-US")}
                </p>
              </div>
              <div className="rounded-md bg-money-expense-container p-4">
                <p className="text-label-md text-on-surface-variant">已支出</p>
                <p className="mt-1 font-mono text-num-display font-medium text-money-expense tabular-nums">
                  ${data.summary.spent.toLocaleString("en-US")}
                </p>
              </div>
              <div className="rounded-md border border-outline bg-surface p-4">
                <p className="text-label-md text-on-surface-variant">已分配</p>
                <p className="mt-1 font-mono text-num-display font-medium tabular-nums">
                  ${data.summary.allocated.toLocaleString("en-US")}
                </p>
              </div>
              <div
                className={cn(
                  "rounded-md p-4",
                  data.summary.unallocated < 0
                    ? "bg-money-warn-container"
                    : "bg-money-remain-container",
                )}
              >
                <p className="text-label-md text-on-surface-variant">尚可分配</p>
                <p
                  className={cn(
                    "mt-1 font-mono text-num-display font-medium tabular-nums",
                    data.summary.unallocated < 0
                      ? "text-money-warn"
                      : "text-money-remain",
                  )}
                >
                  ${data.summary.unallocated.toLocaleString("en-US")}
                </p>
              </div>
            </div>

            {/* Categories breakdown */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-title-md">
                <BarChart3 className="h-4 w-4" />
                細項支出總覽
              </h2>
              {data.categories.length === 0 ? (
                <p className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
                  本期間沒有支出資料
                </p>
              ) : (
                <div className="rounded-md border border-outline bg-surface">
                  {data.categories.map((item, i) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center justify-between gap-3 px-5 py-4",
                        i > 0 && "border-t border-outline",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-body-md font-medium">{item.name}</p>
                        <p className="text-body-sm text-on-surface-variant">
                          交易 {item.transactionCount} 筆 · 預算{" "}
                          {formatCurrency(item.allocated)}
                        </p>
                      </div>
                      <p className="font-mono text-title-md font-medium tabular-nums">
                        {formatCurrency(item.spent)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Payment methods breakdown */}
            <section>
              <h2 className="mb-3 text-title-md">支付方式</h2>
              {data.paymentMethods.length === 0 ? (
                <p className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
                  本期間沒有支付方式統計
                </p>
              ) : (
                <div className="rounded-md border border-outline bg-surface">
                  {data.paymentMethods.map((item, i) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center justify-between gap-3 px-5 py-4",
                        i > 0 && "border-t border-outline",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-body-md font-medium">{item.name}</p>
                        <p className="text-body-sm text-on-surface-variant">
                          占比 {Math.round(item.share * 100)}%
                        </p>
                      </div>
                      <p className="font-mono text-title-md font-medium tabular-nums">
                        {formatCurrency(item.spent)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
