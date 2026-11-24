"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getGroupBadgeColor } from "@/app/quick-entry/helpers";
import { CATEGORY_TILE_CLASS } from "@/components/categoryTileClass";
import { Button as M3Button } from "@/components/m3/Button";
import { MoneyText } from "@/components/m3/MoneyText";
import { getShortCategoryName } from "@/lib/categoryDisplay";
import { CAT_TEXT_CLASS } from "@/lib/categoryStyle";
import {
  ctbcIsPending,
  ctbcMatchRecorded,
  ctbcTaipeiDate,
  ctbcTopCategories,
  type CtbcAction,
  type CtbcCandidate,
  type CtbcCategory,
  type CtbcCommand,
  type CtbcExisting,
  type CtbcInboxData,
} from "@/lib/ctbcInbox";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

const QUICK_CATEGORY_COUNT = 6;

const runLabels: Record<string, string> = {
  received: "收信進行中",
  ready_for_review: "收信正常",
  partial_failure: "部分信件收取失敗",
  failed: "收信失敗",
  missed_run: "有一天沒有收信",
  retry_expired: "今天的重試已逾時",
  no_message: "沒有找到刷卡通知（不代表沒有消費）",
  zero_new_candidates: "這次沒有新的刷卡通知",
};
const closedLabels: Record<string, string> = {
  imported: "已補記",
  already_recorded: "已記過",
  ignored: "已忽略",
  work_excluded: "工作支出",
  expired: "已到期",
};
// 「可能已記過」改由畫面直接列出對應的那筆帳，不再只顯示一行警示
const cardWarnings: Record<string, string> = {
  payment_unknown: "支付來源待確認",
  partial_batch: "同一批信件有部分收取失敗",
  cross_message_duplicate: "有另一封通知內容相同，可能重複",
  amount_mismatch: "同商家有一筆金額不同的紀錄，請留意",
  source_payload_conflict: "通知內容前後不一致，暫時不能補記",
};
const selectClass =
  "h-10 min-w-0 rounded-xs border border-outline bg-surface px-3 text-body-sm text-on-surface focus:outline-primary disabled:opacity-40";
const textButtonClass =
  "h-10 shrink-0 rounded-full px-3 text-label-md font-medium text-on-surface-variant transition-colors duration-m3-short hover:bg-on-surface/5 active:bg-on-surface/10 disabled:cursor-not-allowed disabled:opacity-40";

const showTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "尚無";
const shortDate = (isoDate: string) => {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${month}/${day}`;
};
const merchantOf = (c: CtbcCandidate) => c.merchant || "商家未明";

type Act = (candidate: CtbcCandidate, action: CtbcAction, extra?: { categoryId?: string; linkedId?: string }) => void;

function existingLabel(t: CtbcExisting, categories: CtbcCategory[]) {
  const category = categories.find((c) => c.id === t.category_id);
  const parts = [shortDate(t.date), category ? getShortCategoryName(category.name, category.groupName) : null, t.note || null];
  return parts.filter(Boolean).join(" · ");
}

function PendingCard({ candidate: c, data, quickCategories, nearby, busy, canImport, onAct }: {
  candidate: CtbcCandidate;
  data: CtbcInboxData;
  quickCategories: CtbcCategory[];
  nearby: CtbcExisting | undefined;
  busy: boolean;
  canImport: boolean;
  onAct: Act;
}) {
  // 忽略、工作支出不能復原，所以要點兩下；補記點錯可以到「交易」頁改分類
  const [confirming, setConfirming] = useState<"ignore" | "work" | null>(null);
  const [linking, setLinking] = useState(false);
  const name = merchantOf(c);
  const date = c.occurred_at ? ctbcTaipeiDate(c.occurred_at) : null;
  const blocked = c.warnings.includes("source_payload_conflict");
  const importDisabled = busy || blocked || !canImport;
  const otherCategories = data.categories.filter((o) => !quickCategories.some((q) => q.id === o.id));
  const linkOptions = data.existing.filter(
    (t) => date && Math.abs(Date.parse(t.date) - Date.parse(date)) <= 86_400_000,
  );
  const notes = c.warnings.map((w) => cardWarnings[w]).filter(Boolean);

  const twoTap = (action: "ignore" | "work", label: string, confirmLabel: string) => (
    <button
      type="button"
      className={cn(textButtonClass, confirming === action && "bg-money-warn-container text-money-warn")}
      disabled={busy}
      onClick={() => {
        if (confirming === action) onAct(c, action);
        else setConfirming(action);
      }}
    >
      {confirming === action ? confirmLabel : label}
    </button>
  );

  return (
    <article className="space-y-3 rounded-md border border-outline bg-surface p-4" aria-label={`${name} 待確認`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-title-md text-on-surface">{name}</h3>
          <p className="text-body-sm text-on-surface-variant">
            {date ? shortDate(date) : "日期不明"}
            {c.card_role === "supplementary" ? " · 附卡" : ""}
          </p>
        </div>
        <span className="whitespace-nowrap text-title-md">
          {c.amount === null ? "—" : <MoneyText value={c.amount} type="expense" prefix={false} />}
        </span>
      </div>

      {notes.length > 0 && (
        <ul className="space-y-1 text-body-sm text-money-warn">
          {notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}

      {nearby && (
        <div className="flex items-center gap-2 rounded-md bg-money-warn-container px-3 py-2">
          <p className="min-w-0 flex-1 text-body-sm text-on-surface">
            隔一天有同金額的紀錄：{existingLabel(nearby, data.categories)}
          </p>
          <button
            type="button"
            className="h-9 shrink-0 rounded-full bg-money-warn px-3 text-label-md font-medium text-primary-on transition-opacity duration-m3-short hover:opacity-90 active:opacity-80 disabled:opacity-40"
            disabled={busy}
            aria-label={`${name} 是同一筆`}
            onClick={() => onAct(c, "link", { linkedId: nearby.id })}
          >
            是同一筆
          </button>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-label-md text-on-surface-variant">點分類就記進去</p>
        <div className="grid grid-cols-3 gap-2">
          {quickCategories.map((category) => {
            const color = getGroupBadgeColor(category.groupName);
            return (
              <button
                key={category.id}
                type="button"
                aria-label={`${name} 記到 ${category.name}`}
                disabled={importDisabled}
                onClick={() => onAct(c, "import", { categoryId: category.id })}
                className={cn(
                  "flex h-12 min-w-0 flex-col justify-center rounded-md border-l-4 px-2 text-left transition-colors duration-m3-short disabled:cursor-not-allowed disabled:opacity-40",
                  CATEGORY_TILE_CLASS[color].idle,
                )}
              >
                <span className={cn("truncate text-[11px] font-medium leading-tight", CAT_TEXT_CLASS[color])}>
                  {category.groupName}
                </span>
                <span className="truncate text-label-md font-medium leading-tight text-on-surface">
                  {getShortCategoryName(category.name, category.groupName)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {otherCategories.length > 0 && (
          <select
            aria-label={`${name} 其他分類`}
            className={cn(selectClass, "flex-1 basis-28")}
            value=""
            disabled={importDisabled}
            onChange={(e) => {
              if (e.target.value) onAct(c, "import", { categoryId: e.target.value });
            }}
          >
            <option value="">其他分類…</option>
            {otherCategories.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <button type="button" className={textButtonClass} disabled={busy} aria-expanded={linking} onClick={() => setLinking((open) => !open)}>
          已記過
        </button>
        {twoTap("work", "工作支出", "確定是工作支出")}
        {twoTap("ignore", "忽略", "確定忽略")}
      </div>

      {linking && (
        <select
          aria-label={`${name} 既有交易`}
          className={cn(selectClass, "w-full")}
          value=""
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) onAct(c, "link", { linkedId: e.target.value });
          }}
        >
          <option value="">{linkOptions.length > 0 ? "選擇是哪一筆（前後一天內）" : "前後一天內沒有紀錄"}</option>
          {linkOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {existingLabel(t, data.categories)} ${t.amount}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}

export function CtbcInboxClient() {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [data, setData] = useState<CtbcInboxData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState("");
  // 使用者說「不是同一筆」的刷卡，改放回「還沒記的」
  const [notSame, setNotSame] = useState<string[]>([]);
  const inFlight = useRef(false);
  // 同一個操作重試時沿用同一把識別碼，伺服器才不會重複記帳
  const keys = useRef(new Map<string, string>());

  const api = useCallback(async (method: string, body?: unknown) => {
    const session = await client.auth.getSession();
    if (!session.data.session) throw new Error("請先登入，才能查看刷卡待確認");
    const response = await fetch("/api/ctbc/inbox", {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.data.session.access_token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const failure = new Error(
        response.status === 409 ? "資料剛剛有變動，已重新載入，請再試一次" : response.status === 401 ? "請重新登入" : "目前無法確認有沒有成功，已重新載入，請核對後再試",
      ) as Error & { status?: number };
      failure.status = response.status;
      throw failure;
    }
    return response.json();
  }, [client]);

  const load = useCallback(async () => {
    const fresh = (await api("GET")) as CtbcInboxData;
    setData(fresh);
    return fresh;
  }, [api]);

  useEffect(() => {
    let active = true;
    api("GET")
      .then((fresh) => { if (active) setData(fresh); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [api]);

  const send = useCallback((c: CtbcCandidate, action: CtbcAction, extra: { categoryId?: string; paymentId?: string; linkedId?: string }) => {
    const command: Omit<CtbcCommand, "actionKey"> = {
      candidateId: c.id,
      expectedVersion: c.version,
      action,
      categoryId: action === "import" ? extra.categoryId ?? null : null,
      paymentId: action === "import" ? extra.paymentId ?? null : null,
      linkedId: action === "link" ? extra.linkedId ?? null : null,
      // 使用者在畫面上已經看得到提醒（同金額紀錄等），點下去就代表看過了
      resolveRisk: true,
    };
    const identity = JSON.stringify(command);
    const actionKey = keys.current.get(identity) || crypto.randomUUID();
    keys.current.set(identity, actionKey);
    return api("POST", { ...command, actionKey });
  }, [api]);

  const matches = useMemo(() => (data ? ctbcMatchRecorded(data.candidates, data.existing) : null), [data]);
  const pending = useMemo(() => (data ? data.candidates.filter(ctbcIsPending) : []), [data]);
  const recorded = pending.filter((c) => matches?.recorded.has(c.id) && !notSame.includes(c.id));
  const unrecorded = pending.filter((c) => !recorded.includes(c));
  const closed = data ? data.candidates.filter((c) => !ctbcIsPending(c) && c.amount !== null) : [];
  const quickCategories = useMemo(
    () => (data ? ctbcTopCategories(data.categories, data.existing, QUICK_CATEGORY_COUNT) : []),
    [data],
  );
  // 支付方式：預設用收信時判斷的那張卡；只有一種支付方式時直接用它
  const suggestedPayment = pending.find((c) => c.suggested_payment_id)?.suggested_payment_id ?? "";
  const paymentId =
    data?.payments.find((p) => p.id === paymentChoice)?.id ??
    data?.payments.find((p) => p.id === suggestedPayment)?.id ??
    (data?.payments.length === 1 ? data.payments[0].id : "");

  const run = async (work: () => Promise<string>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await work());
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const act: Act = (c, action, extra = {}) => {
    void run(async () => {
      const name = merchantOf(c);
      if (action === "import") {
        const category = data?.categories.find((o) => o.id === extra.categoryId);
        if (!category || !paymentId) throw new Error("請先選支付方式");
        const body = { categoryId: category.id, paymentId };
        try {
          await send(c, "import", body);
        } catch (e) {
          // 伺服器補記前會再查一次有沒有同金額紀錄；剛查到時會先擋下並更新版本，這裡用新版本再送一次
          if ((e as { status?: number }).status !== 409) throw e;
          const fresh = (await load()).candidates.find((o) => o.id === c.id);
          if (!fresh || !ctbcIsPending(fresh) || fresh.version === c.version) throw e;
          await send(fresh, "import", body);
        }
        await load();
        return `已補記：${name} → ${getShortCategoryName(category.name, category.groupName)}（點錯可到「交易」頁修改）`;
      }
      await send(c, action, extra);
      await load();
      return action === "link" ? `已標為已記過：${name}` : action === "work" ? `已排除（工作支出）：${name}` : `已忽略：${name}`;
    });
  };

  const linkAll = () => {
    void run(async () => {
      let done = 0;
      try {
        for (const c of recorded) {
          await send(c, "link", { linkedId: matches!.recorded.get(c.id)!.id });
          done += 1;
        }
      } finally {
        await load().catch(() => {});
      }
      return `已標為已記過 ${done} 筆`;
    });
  };

  const latest = data?.latestRun;
  const runHealthy = latest && ["ready_for_review", "zero_new_candidates", "received"].includes(latest.status);

  return (
    <main aria-busy={busy} className="min-h-screen bg-background text-on-surface">
      <div className="mx-auto max-w-md space-y-4 px-4 py-4 pb-24">
        <Link className="text-body-sm text-primary hover:underline focus-visible:outline" href="/settings">
          返回設定
        </Link>
        <div>
          <h1 className="text-headline-sm">刷卡待確認{data ? `（${data.pendingCount}）` : ""}</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            刷卡通知會自動收進來，你確認後才會記進帳裡。
          </p>
        </div>

        {busy ? (
          <p role="status" className="rounded-md bg-primary-container px-4 py-3 text-body-sm">處理中…</p>
        ) : (
          message && <p role="status" className="rounded-md bg-primary-container px-4 py-3 text-body-sm">{message}</p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-money-warn-container px-4 py-3 text-body-sm text-money-warn">{error}</p>
        )}
        {!data && !error && <p role="status" className="text-body-sm text-on-surface-variant">載入中…</p>}

        {data && (
          <>
            {recorded.length > 0 && (
              <section className="space-y-3 rounded-md border border-outline bg-surface p-4" aria-label="看起來已經記過">
                <div>
                  <h2 className="text-title-md">{recorded.length} 筆看起來已經記過</h2>
                  <p className="text-body-sm text-on-surface-variant">同一天有一樣金額的紀錄，視為同一筆。</p>
                </div>
                <ul className="divide-y divide-outline-variant">
                  {recorded.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 py-2" aria-label={`${merchantOf(c)} 已記過`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-md text-on-surface">{merchantOf(c)}</p>
                        <p className="truncate text-body-sm text-on-surface-variant">
                          你記的：{existingLabel(matches!.recorded.get(c.id)!, data.categories)}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-body-md">
                        <MoneyText value={c.amount ?? 0} type="expense" prefix={false} />
                      </span>
                      <button
                        type="button"
                        className={textButtonClass}
                        disabled={busy}
                        aria-label={`${merchantOf(c)} 不是同一筆`}
                        onClick={() => setNotSame((old) => [...old, c.id])}
                      >
                        不是
                      </button>
                    </li>
                  ))}
                </ul>
                <M3Button variant="filled" className="w-full" disabled={busy} onClick={linkAll}>
                  全部標為已記過（{recorded.length}）
                </M3Button>
              </section>
            )}

            <section className="space-y-3" aria-label="還沒記的">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-title-md">還沒記的（{unrecorded.length}）</h2>
                {data.payments.length > 1 && unrecorded.length > 0 && (
                  <select
                    aria-label="支付方式"
                    className={cn(selectClass, "max-w-[55%]")}
                    value={paymentId}
                    disabled={busy}
                    onChange={(e) => setPaymentChoice(e.target.value)}
                  >
                    <option value="">選支付方式</option>
                    {data.payments.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
              {unrecorded.length > 0 && !paymentId && (
                <p className="text-body-sm text-money-warn">請先在右上選這張卡對應的支付方式，才能補記。</p>
              )}
              {unrecorded.length === 0 && (
                <p className="rounded-md border border-outline bg-surface px-4 py-3 text-body-sm text-on-surface-variant">
                  {recorded.length > 0 ? "其他都處理完了。" : "目前沒有待確認的刷卡。"}
                </p>
              )}
              {unrecorded.map((c) => (
                <PendingCard
                  key={`${c.id}:${c.version}`}
                  candidate={c}
                  data={data}
                  quickCategories={quickCategories}
                  nearby={matches?.nearby.get(c.id)}
                  busy={busy}
                  canImport={!!paymentId}
                  onAct={act}
                />
              ))}
            </section>

            {closed.length > 0 && (
              <details className="rounded-md border border-outline bg-surface px-4 py-3">
                <summary className="cursor-pointer text-body-md">最近處理過的（{closed.length}）</summary>
                <ul className="mt-2 divide-y divide-outline-variant">
                  {closed.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-body-sm">
                      <span className="min-w-0 truncate">
                        {c.occurred_at ? `${shortDate(ctbcTaipeiDate(c.occurred_at))} ` : ""}
                        {merchantOf(c)}
                      </span>
                      <span className="shrink-0 text-on-surface-variant">
                        ${c.amount} · {closedLabels[c.status] ?? c.status}
                        {c.status === "already_recorded" && !c.linked_transaction_id ? "（原交易已刪除）" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <details className="rounded-md border border-outline bg-surface px-4 py-3 text-body-sm" aria-label="收信狀態">
              <summary className={cn("cursor-pointer text-body-md", latest && !runHealthy && "text-money-warn")}>
                收信狀態：{latest ? runLabels[latest.status] || "狀態不明" : "還沒收過信"}
                {latest ? `（${showTime(latest.last_success_at ?? latest.last_attempt_at)}）` : ""}
              </summary>
              <div className="mt-2 space-y-1 text-on-surface-variant">
                {latest && (
                  <>
                    <p>每天 17:00 之後收信，涵蓋前三天的刷卡通知。</p>
                    <p>最近嘗試：{showTime(latest.last_attempt_at)}；最近完成：{showTime(latest.last_success_at)}</p>
                    <p>失敗 {latest.failures} · 拒絕 {latest.rejected} · 超出範圍 {latest.outside_window} · 延後 {latest.deferred}</p>
                  </>
                )}
                <p>通知可能晚到；這裡沒有不代表沒有消費，也還沒跟月結帳單核對。</p>
                <M3Button
                  variant="text"
                  disabled={busy}
                  onClick={() => void run(async () => { await load(); return "已重新載入"; })}
                >
                  重新載入
                </M3Button>
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
