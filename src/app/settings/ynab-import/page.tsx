"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CloudDownload,
  DatabaseZap,
  KeyRound,
  LoaderCircle,
  WalletCards,
} from "lucide-react";

import { LoadingCard } from "@/components/LoadingCard";
import { StateCard } from "@/components/StateCard";
import { Toast } from "@/components/Toast";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { ToastState } from "@/lib/types";
import {
  buildYnabImportPreview,
  importYnabPreviewToLiteYnab,
  type YnabImportPreview,
  type YnabImportResult,
  type YnabPlan,
  type YnabPlanSnapshot,
} from "@/lib/ynabImport";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "發生未知錯誤";
}

export default function YnabImportPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [token, setToken] = useState("");
  const [plans, setPlans] = useState<YnabPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [preview, setPreview] = useState<YnabImportPreview | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<YnabImportResult | null>(null);

  useEffect(() => {
    const timer = toast ? window.setTimeout(() => setToast(null), 3000) : undefined;

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [toast]);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setIsCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  async function handleLoadPlans() {
    if (!token.trim()) {
      setToast({ tone: "info", message: "請先貼上 YNAB Personal Access Token" });
      return;
    }

    setIsLoadingPlans(true);
    setLoadError(null);
    setPreview(null);
    setImportResult(null);

    try {
      const response = await fetch("/api/ynab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "listPlans",
          token: token.trim(),
        }),
      });

      const payload = (await response.json()) as { error?: string; plans?: YnabPlan[] };

      if (!response.ok || !payload.plans) {
        throw new Error(payload.error || "無法讀取 YNAB 計畫清單");
      }

      setPlans(payload.plans);
      setSelectedPlanId(payload.plans[0]?.id ?? "");
      setToast({ tone: "success", message: `已讀取 ${payload.plans.length} 個 YNAB 計畫` });
    } catch (error) {
      const message = getErrorMessage(error);
      setLoadError(message);
      setToast({ tone: "error", message });
    } finally {
      setIsLoadingPlans(false);
    }
  }

  async function handleLoadPreview() {
    if (!token.trim()) {
      setToast({ tone: "info", message: "請先貼上 YNAB Personal Access Token" });
      return;
    }

    if (!selectedPlanId) {
      setToast({ tone: "info", message: "請先選擇要匯入的 YNAB 計畫" });
      return;
    }

    setIsLoadingPreview(true);
    setLoadError(null);
    setImportResult(null);

    try {
      const response = await fetch("/api/ynab", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "loadPlan",
          token: token.trim(),
          planId: selectedPlanId,
        }),
      });

      const payload = (await response.json()) as { error?: string } & Partial<YnabPlanSnapshot>;

      if (
        !response.ok ||
        !payload.plan ||
        !payload.accounts ||
        !payload.categoryGroups ||
        !payload.categories ||
        !payload.transactions
      ) {
        throw new Error(payload.error || "無法建立 YNAB 匯入預覽");
      }

      const nextPreview = buildYnabImportPreview({
        plan: payload.plan,
        accounts: payload.accounts,
        categoryGroups: payload.categoryGroups,
        categories: payload.categories,
        transactions: payload.transactions,
      });

      setPreview(nextPreview);
      setToast({
        tone: "success",
        message: `已整理 ${nextPreview.transactions.length} 筆支出交易，準備匯入預覽`,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setLoadError(message);
      setToast({ tone: "error", message });
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function handleImport() {
    if (!preview) {
      setToast({ tone: "info", message: "請先產生匯入預覽" });
      return;
    }

    setIsImporting(true);
    setLoadError(null);

    try {
      const result = await importYnabPreviewToLiteYnab(supabase, preview);
      setImportResult(result);
      setToast({
        tone: "success",
        message: `已匯入 ${result.importedTransactionCount} 筆交易，略過 ${result.skippedDuplicateCount} 筆重複資料`,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setLoadError(message);
      setToast({ tone: "error", message });
    } finally {
      setIsImporting(false);
    }
  }

  if (isCheckingSession) {
    return (
      <main className="box-border min-h-screen bg-chrome-400 px-3 py-3 pb-[88px] font-chrome-body text-chrome-base text-chrome-900">
        <section className="mx-auto w-full max-w-md">
          <LoadingCard label="正在確認登入狀態..." />
        </section>
      </main>
    );
  }

  return (
    <main className="box-border min-h-screen bg-chrome-400 px-3 py-3 pb-[88px] font-chrome-body text-chrome-base text-chrome-900">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <section className="mx-auto w-full max-w-md space-y-4">
        <div className="chrome-window p-[6px]">
          <div className="chrome-titlebar flex items-center justify-between gap-3 px-chrome-md py-chrome-sm">
            <Link
              href="/settings"
              className="chrome-btn flex h-10 w-10 items-center justify-center"
              aria-label="返回設定"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="text-right">
              <p className="font-chrome-heading text-chrome-xs font-bold tracking-[0.16em] text-chrome-800">
                YNAB 匯入器
              </p>
              <p className="text-chrome-sm text-chrome-800">把歷史交易搬進 Lite YNAB</p>
            </div>
          </div>
        </div>

        <section className="chrome-window p-[6px]">
          <div className="chrome-titlebar px-chrome-md py-chrome-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-chrome-heading text-chrome-xs font-bold tracking-[0.16em] text-chrome-800">
                  匯入流程
                </p>
                <h1 className="mt-2 font-chrome-heading text-chrome-2xl font-bold text-chrome-900">
                  先預覽，再正式匯入
                </h1>
                <p className="mt-2 text-sm leading-6 text-chrome-800">
                  這個工具會用 YNAB API 讀取你的計畫、分類、帳戶與支出交易，再自動建立 Lite YNAB
                  缺少的大項分類、小項分類與支付方式。為了安全起見，它會先顯示預覽，再由你按下正式匯入。
                </p>
              </div>
              <div className="chrome-btn flex h-11 w-11 items-center justify-center">
                <DatabaseZap className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="space-y-4 px-chrome-md py-chrome-md">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                <KeyRound className="h-4 w-4" />
                YNAB Personal Access Token
              </span>
              <textarea
                value={token}
                onChange={(event) => setToken(event.target.value)}
                rows={4}
                className="chrome-field min-h-[112px] w-full px-chrome-md py-chrome-md font-chrome-mono text-sm"
                placeholder="貼上你在 YNAB Developer Settings 產生的 Personal Access Token"
              />
              <p className="mt-2 text-xs leading-5 text-chrome-700">
                Token 只會在你按下讀取時送到本網站的 API 路由，不會寫進資料庫，也不會出現在 Change Log。
              </p>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleLoadPlans()}
                disabled={isLoadingPlans || isLoadingPreview || isImporting}
                className="chrome-btn flex min-h-11 items-center justify-center gap-2 px-chrome-md py-chrome-md font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide disabled:cursor-not-allowed"
              >
                {isLoadingPlans ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
                讀取計畫
              </button>
              <button
                type="button"
                onClick={() => void handleLoadPreview()}
                disabled={!selectedPlanId || isLoadingPlans || isLoadingPreview || isImporting}
                className="chrome-btn chrome-btn--info flex min-h-11 items-center justify-center gap-2 px-chrome-md py-chrome-md font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide disabled:cursor-not-allowed"
              >
                {isLoadingPreview ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                建立預覽
              </button>
            </div>

            <label className="block">
              <span className="mb-2 block font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide text-chrome-800">
                YNAB 計畫
              </span>
              <select
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
              >
                <option value="">請先讀取計畫</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {loadError ? (
          <StateCard
            title="匯入流程發生錯誤"
            description={loadError}
            tone="error"
          />
        ) : null}

        {preview ? (
          <>
            <section className="chrome-window p-[6px]">
              <div className="chrome-titlebar px-chrome-md py-chrome-sm">
                <div>
                  <p className="font-chrome-heading text-chrome-xs font-bold tracking-[0.16em] text-chrome-800">
                    預覽摘要
                  </p>
                  <h2 className="mt-2 font-chrome-heading text-chrome-xl font-bold text-chrome-900">
                    {preview.planName}
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 px-chrome-md py-chrome-md">
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">大項分類</p>
                  <p className="mt-2 font-display text-3xl text-paper">{preview.groupNames.length}</p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">小項分類</p>
                  <p className="mt-2 font-display text-3xl text-paper">{preview.categoryPairs.length}</p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">支付方式</p>
                  <p className="mt-2 font-display text-3xl text-paper">{preview.paymentMethodNames.length}</p>
                </div>
                <div className="chrome-led-panel p-chrome-md text-center">
                  <p className="text-sm uppercase tracking-[0.22em] text-paper/60">支出交易</p>
                  <p className="mt-2 font-display text-3xl text-paper">{preview.transactions.length}</p>
                </div>
              </div>

              <div className="px-chrome-md pb-chrome-md text-sm leading-6 text-chrome-800">
                <p>匯入區間：{preview.startDate ?? "無"} 至 {preview.endDate ?? "無"}</p>
                <p>本版預設只匯入支出交易，收入與轉帳會先略過。</p>
              </div>
            </section>

            <section className="chrome-window p-[6px]">
              <div className="chrome-titlebar px-chrome-md py-chrome-sm">
                <div>
                  <p className="font-chrome-heading text-chrome-xs font-bold tracking-[0.16em] text-chrome-800">
                    樣本資料
                  </p>
                  <h2 className="mt-2 font-chrome-heading text-chrome-xl font-bold text-chrome-900">
                    前 5 筆預覽
                  </h2>
                </div>
              </div>

              <div className="space-y-3 px-chrome-md py-chrome-md">
                {preview.sampleTransactions.map((transaction) => (
                  <div key={transaction.sourceId} className="chrome-window p-[6px]">
                    <div className="chrome-statusbar flex items-center justify-between gap-3 px-chrome-md py-chrome-sm">
                      <span>{transaction.date}</span>
                      <span>${transaction.amount.toLocaleString("zh-TW")}</span>
                    </div>
                    <div className="space-y-1 px-chrome-md py-chrome-md text-sm text-chrome-900">
                      <p>{transaction.categoryGroupName} / {transaction.categoryName}</p>
                      <p>{transaction.accountName}</p>
                      <p className="text-chrome-700">{transaction.note || "無備註"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="chrome-window p-[6px]">
              <div className="chrome-titlebar px-chrome-md py-chrome-sm">
                <div>
                  <p className="font-chrome-heading text-chrome-xs font-bold tracking-[0.16em] text-chrome-800">
                    正式匯入
                  </p>
                  <h2 className="mt-2 font-chrome-heading text-chrome-xl font-bold text-chrome-900">
                    將資料寫進 Lite YNAB
                  </h2>
                </div>
              </div>

              <div className="space-y-4 px-chrome-md py-chrome-md">
                <p className="text-sm leading-6 text-chrome-800">
                  匯入時會自動建立缺少的大項分類、小項分類與支付方式，並且用
                  「日期＋金額＋分類＋支付方式＋備註」做一次重複檢查，避免你重跑時整批重複灌入。
                </p>

                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={isImporting || isLoadingPreview || isLoadingPlans}
                  className="chrome-btn chrome-btn--success flex min-h-11 w-full items-center justify-center gap-2 px-chrome-md py-chrome-md font-chrome-heading text-chrome-sm font-bold tracking-chrome-wide disabled:cursor-not-allowed"
                >
                  {isImporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
                  開始匯入
                </button>

                {importResult ? (
                  <div className="chrome-led-panel space-y-2 px-chrome-md py-chrome-md text-sm text-paper">
                    <p>已建立大項分類 {importResult.createdGroupCount} 個</p>
                    <p>已建立小項分類 {importResult.createdCategoryCount} 個</p>
                    <p>已建立支付方式 {importResult.createdPaymentMethodCount} 個</p>
                    <p>已匯入交易 {importResult.importedTransactionCount} 筆</p>
                    <p>已略過重複資料 {importResult.skippedDuplicateCount} 筆</p>
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
