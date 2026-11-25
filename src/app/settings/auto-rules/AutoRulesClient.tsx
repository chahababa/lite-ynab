"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button as M3Button } from "@/components/m3/Button";
import { getShortCategoryName } from "@/lib/categoryDisplay";
import type { CtbcAutoRule } from "@/lib/ctbcAutoRules";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type CategoryChoice = { id: string; name: string; groupName: string };

/** 下拉選單裡「算工作、不記帳」那個選項的值。 */
const WORK_CHOICE = "__work__";

const inputClass =
  "h-10 w-full rounded-xs border border-outline-variant bg-surface px-3 text-body-md text-on-surface outline-none focus:border-2 focus:border-primary";

function limitLabel(maxAmount: number | null) {
  return maxAmount === null ? "不限金額" : `$${maxAmount.toLocaleString("en-US")} 以下`;
}

export function AutoRulesClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rules, setRules] = useState<CtbcAutoRule[] | null>(null);
  const [categories, setCategories] = useState<CategoryChoice[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [maxAmount, setMaxAmount] = useState("1000");

  const load = useCallback(async () => {
    const [rulesResult, groupsResult, categoriesResult] = await Promise.all([
      supabase.from("ctbc_auto_rules").select("id,pattern,action,category_id,max_amount,enabled").order("created_at", { ascending: true }),
      supabase.from("category_groups").select("id,name,sort_order").order("sort_order", { ascending: true }),
      supabase.from("categories").select("id,name,sort_order,category_group_id").order("sort_order", { ascending: true }),
    ]);
    if (rulesResult.error || groupsResult.error || categoriesResult.error) {
      throw new Error("讀取自動歸類規則失敗，請稍後再試");
    }

    const groups = (groupsResult.data ?? []) as { id: string; name: string; sort_order: number }[];
    const groupOrder = new Map(groups.map((group, index) => [group.id, index]));
    const groupName = new Map(groups.map((group) => [group.id, group.name]));
    const sorted = ((categoriesResult.data ?? []) as { id: string; name: string; sort_order: number; category_group_id: string }[])
      .slice()
      .sort(
        (a, b) =>
          (groupOrder.get(a.category_group_id) ?? 0) - (groupOrder.get(b.category_group_id) ?? 0) || a.sort_order - b.sort_order,
      )
      .map((category) => ({ id: category.id, name: category.name, groupName: groupName.get(category.category_group_id) ?? "" }));

    setRules((rulesResult.data ?? []) as CtbcAutoRule[]);
    setCategories(sorted);
  }, [supabase]);

  useEffect(() => {
    load().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "讀取失敗"));
  }, [load]);

  const categoryLabel = useCallback(
    (id: string | null) => {
      const category = categories.find((item) => item.id === id);
      return category ? `${category.groupName}・${getShortCategoryName(category.name, category.groupName)}` : "（分類已刪除）";
    },
    [categories],
  );

  async function run(action: () => Promise<{ error: unknown }>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: actionError } = await action();
      if (actionError) throw actionError;
      await load();
      setMessage(done);
    } catch {
      setError("沒有成功，請稍後再試。同一個商店文字只能設一條規則。");
    } finally {
      setBusy(false);
    }
  }

  async function addRule() {
    const text = pattern.trim();
    if (text.length < 2) {
      setError("商店文字至少要 2 個字，例如「全家」或「55688」。");
      return;
    }
    if (!categoryId) {
      setError("請選擇要記到哪個分類，或選「算工作」。");
      return;
    }
    const limit = maxAmount.trim() === "" ? null : Number(maxAmount);
    if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
      setError("金額上限請填正整數，或留空代表不限金額。");
      return;
    }
    const work = categoryId === WORK_CHOICE;
    await run(
      async () =>
        supabase
          .from("ctbc_auto_rules")
          .insert({ pattern: text, action: work ? "work" : "import", category_id: work ? null : categoryId, max_amount: limit }),
      `已新增規則「${text}」。`,
    );
    setPattern("");
  }

  return (
    <main aria-busy={busy} className="min-h-screen bg-background font-sans text-on-surface">
      <div className="mx-auto max-w-md space-y-4 px-4 py-4 pb-24">
        <Link className="text-body-sm text-primary hover:underline" href="/settings">
          ← 回設定
        </Link>
        <div>
          <h1 className="text-headline-sm">刷卡自動歸類</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            刷卡通知的商店名稱包含下面的文字、金額又在上限以內時，會直接記到指定分類（或標為工作、不記帳），不再問你。
            不符合的、或可能重複的，照舊留在「刷卡待確認」。
          </p>
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-money-warn-container px-4 py-2 text-body-sm text-money-warn">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="rounded-md bg-primary-container px-4 py-2 text-body-sm text-primary-on-container">
            {message}
          </p>
        ) : null}

        <section className="rounded-md border border-outline bg-surface p-4">
          <h2 className="text-title-md">目前的規則</h2>
          {rules === null ? (
            <p className="mt-2 text-body-sm text-on-surface-variant">載入中...</p>
          ) : rules.length === 0 ? (
            <p className="mt-2 text-body-sm text-on-surface-variant">還沒有規則。所有刷卡都會進「刷卡待確認」。</p>
          ) : (
            <ul className="mt-2 divide-y divide-outline-variant">
              {rules.map((rule) => (
                <li key={rule.id} className="flex items-center gap-3 py-2.5" aria-label={`規則 ${rule.pattern}`}>
                  <div className={rule.enabled ? "min-w-0 flex-1" : "min-w-0 flex-1 opacity-50"}>
                    <p className="break-words text-body-md font-medium text-on-surface">{rule.pattern}</p>
                    <p className="text-body-sm text-on-surface-variant">
                      → {rule.action === "work" ? "算工作、不記帳" : categoryLabel(rule.category_id)}・{limitLabel(rule.max_amount)}
                      {rule.enabled ? "" : "・已停用"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${rule.enabled ? "停用" : "啟用"}規則 ${rule.pattern}`}
                    onClick={() =>
                      void run(
                        async () => supabase.from("ctbc_auto_rules").update({ enabled: !rule.enabled }).eq("id", rule.id),
                        rule.enabled ? `已停用「${rule.pattern}」，之後會回到待確認。` : `已啟用「${rule.pattern}」。`,
                      )
                    }
                    className="h-9 shrink-0 rounded-full border border-outline-variant px-3 text-label-md text-primary transition-colors duration-m3-short hover:bg-primary/5 active:bg-primary/10 disabled:opacity-40"
                  >
                    {rule.enabled ? "停用" : "啟用"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`刪除規則 ${rule.pattern}`}
                    onClick={() =>
                      void run(
                        async () => supabase.from("ctbc_auto_rules").delete().eq("id", rule.id),
                        `已刪除規則「${rule.pattern}」。`,
                      )
                    }
                    className="h-9 shrink-0 rounded-full px-3 text-label-md text-money-expense transition-colors duration-m3-short hover:bg-money-expense/5 active:bg-money-expense/10 disabled:opacity-40"
                  >
                    刪除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 rounded-md border border-outline bg-surface p-4">
          <h2 className="text-title-md">新增規則</h2>
          <label className="block space-y-1">
            <span className="text-label-md text-on-surface-variant">商店名稱包含</span>
            <input
              aria-label="商店名稱包含"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="例如：全家、55688、NETFLIX"
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-label-md text-on-surface-variant">怎麼處理</span>
            <select
              aria-label="記到分類"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={inputClass}
            >
              <option value="">請選擇</option>
              <option value={WORK_CHOICE}>算工作、不記入個人帳本</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.groupName}・{getShortCategoryName(category.name, category.groupName)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-label-md text-on-surface-variant">金額上限（留空代表不限）</span>
            <input
              aria-label="金額上限"
              inputMode="numeric"
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value.replace(/[^\d]/g, ""))}
              className={`${inputClass} text-center font-mono tabular-nums`}
            />
          </label>
          <M3Button variant="filled" className="h-11 w-full" disabled={busy} onClick={() => void addRule()}>
            新增規則
          </M3Button>
        </section>
      </div>
    </main>
  );
}
