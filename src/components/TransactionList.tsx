"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CreditCard, Pencil, Tag, Trash2, Wallet, X } from "lucide-react";

import type {
  CategoryOption,
  PaymentMethodOption,
  TransactionWithCategory,
} from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

type TransactionListProps = {
  categories: CategoryOption[];
  paymentMethods: PaymentMethodOption[];
  items: TransactionWithCategory[];
  pendingTransactionId: string | null;
  onSave: (input: {
    id: string;
    amount: number;
    date: string;
    categoryId: string;
    paymentMethodId: string;
    note: string;
  }) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
};

type DraftState = {
  amount: string;
  date: string;
  categoryId: string;
  paymentMethodId: string;
  note: string;
};

export function TransactionList({
  categories,
  paymentMethods,
  items,
  pendingTransactionId,
  onSave,
  onDelete,
}: TransactionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(
      items.reduce<Record<string, DraftState>>((accumulator, item) => {
        accumulator[item.id] = {
          amount: item.amount.toString(),
          date: item.date,
          categoryId: item.category_id,
          paymentMethodId: item.payment_method_id,
          note: item.note ?? "",
        };
        return accumulator;
      }, {}),
    );
  }, [items]);

  useEffect(() => {
    if (!editingId) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [editingId]);

  const editingItem = useMemo(
    () => items.find((item) => item.id === editingId) ?? null,
    [editingId, items],
  );
  const editingDraft = editingId ? drafts[editingId] : undefined;
  const isEditingPending = editingId !== null && pendingTransactionId === editingId;

  function openEditor(itemId: string) {
    setEditingId(itemId);
    setFormError(null);
  }

  function closeEditor() {
    if (isEditingPending) return;
    setEditingId(null);
    setFormError(null);
  }

  function updateDraft(field: keyof DraftState, value: string) {
    if (!editingId) return;
    setDrafts((current) => ({
      ...current,
      [editingId]: {
        ...current[editingId],
        [field]: value,
      },
    }));
  }

  async function handleSave() {
    if (!editingId || !editingDraft) return;

    if (!editingDraft.amount || Number(editingDraft.amount) <= 0) {
      setFormError("請輸入大於 0 的金額。");
      return;
    }

    if (!editingDraft.date) {
      setFormError("請選擇日期。");
      return;
    }

    if (!editingDraft.categoryId) {
      setFormError("請選擇分類。");
      return;
    }

    if (!editingDraft.paymentMethodId) {
      setFormError("請選擇支付方式。");
      return;
    }

    setFormError(null);

    const didSave = await onSave({
      id: editingId,
      amount: Number(editingDraft.amount),
      date: editingDraft.date,
      categoryId: editingDraft.categoryId,
      paymentMethodId: editingDraft.paymentMethodId,
      note: editingDraft.note.trim(),
    });

    if (didSave) {
      closeEditor();
    }
  }

  if (items.length === 0) {
    return (
      <div className="chrome-window p-[6px]">
        <div className="chrome-led-panel px-chrome-md py-chrome-lg">
          <p className="chrome-led-label text-chrome-sm uppercase">transactions</p>
          <p className="mt-2 text-sm text-chrome-300">目前沒有符合條件的交易資料。</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="chrome-window overflow-hidden p-[4px]">
        <div className="grid grid-cols-[76px_1fr_74px_1fr_88px_68px] gap-2 border-b border-chrome-700 bg-chrome-200 px-2 py-2 text-[10px] font-chrome-heading font-bold uppercase tracking-chrome-wide text-chrome-800">
          <span>日期</span>
          <span>分類</span>
          <span>支付</span>
          <span>備註</span>
          <span className="text-right">金額</span>
          <span className="text-center">操作</span>
        </div>

        <div className="divide-y divide-chrome-700/70">
          {items.map((item) => {
            const isPending = pendingTransactionId === item.id;

            return (
              <div
                key={item.id}
                className="grid grid-cols-[76px_1fr_74px_1fr_88px_68px] items-center gap-2 px-2 py-2 text-[11px] text-chrome-900"
              >
                <span className="truncate font-chrome-mono text-chrome-800">
                  {item.date}
                </span>
                <div className="min-w-0 truncate">
                  <span className="text-chrome-700">{item.categoryGroupName}</span>
                  <span className="mx-1 text-chrome-600">/</span>
                  <span className="font-chrome-heading font-bold">
                    {item.categoryName}
                  </span>
                </div>
                <span className="truncate text-chrome-800">
                  {item.paymentMethodName}
                </span>
                <span className="truncate text-chrome-700">
                  {item.note || "無備註"}
                </span>
                <span className="truncate text-right font-chrome-mono text-[var(--chrome-led-green)]">
                  {formatCurrency(item.amount)}
                </span>
                <div className="flex justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditor(item.id)}
                    disabled={isPending}
                    className="chrome-btn flex h-7 w-7 items-center justify-center px-0 py-0 disabled:cursor-not-allowed"
                    aria-label="編輯交易"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(item.id)}
                    disabled={isPending}
                    className="chrome-btn chrome-btn--danger flex h-7 w-7 items-center justify-center px-0 py-0 disabled:cursor-not-allowed"
                    aria-label="刪除交易"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editingItem && editingDraft ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="關閉編輯交易視窗"
            onClick={closeEditor}
            className="absolute inset-0 bg-black/40"
          />

          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md px-4 pb-4">
            <div role="dialog" aria-modal="true" aria-label="編輯交易" className="chrome-window p-[6px]">
              <div className="chrome-titlebar mb-chrome-md flex items-center justify-between gap-3 px-chrome-md py-chrome-sm">
                <div>
                  <p className="font-chrome-heading text-chrome-xs font-bold uppercase tracking-chrome-wide text-chrome-800">
                    edit transaction
                  </p>
                  <p className="font-chrome-heading text-chrome-lg font-bold uppercase tracking-chrome-wide text-chrome-900">
                    {formatCurrency(Number(editingDraft.amount || 0))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={isEditingPending}
                  className="chrome-btn flex h-9 w-9 items-center justify-center disabled:cursor-not-allowed"
                  aria-label="關閉編輯交易視窗"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 px-chrome-md pb-chrome-md">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-800">
                    <Wallet className="h-4 w-4" />
                    金額
                  </span>
                  <input
                    inputMode="numeric"
                    value={editingDraft.amount}
                    disabled={isEditingPending}
                    onChange={(event) => updateDraft("amount", event.target.value.replace(/[^\d]/g, ""))}
                    className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                    placeholder="0"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-800">
                    <CalendarDays className="h-4 w-4" />
                    日期
                  </span>
                  <input
                    type="date"
                    value={editingDraft.date}
                    disabled={isEditingPending}
                    onChange={(event) => updateDraft("date", event.target.value)}
                    className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-800">
                    <Tag className="h-4 w-4" />
                    分類
                  </span>
                  <select
                    value={editingDraft.categoryId}
                    disabled={isEditingPending}
                    onChange={(event) => updateDraft("categoryId", event.target.value)}
                    className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.groupName} / {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-800">
                    <CreditCard className="h-4 w-4" />
                    支付方式
                  </span>
                  <select
                    value={editingDraft.paymentMethodId}
                    disabled={isEditingPending}
                    onChange={(event) => updateDraft("paymentMethodId", event.target.value)}
                    className="chrome-field min-h-11 w-full px-chrome-md py-chrome-md"
                  >
                    {paymentMethods.map((paymentMethod) => (
                      <option key={paymentMethod.id} value={paymentMethod.id}>
                        {paymentMethod.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide text-chrome-800">
                    備註
                  </span>
                  <textarea
                    value={editingDraft.note}
                    disabled={isEditingPending}
                    onChange={(event) => updateDraft("note", event.target.value)}
                    rows={3}
                    className="chrome-field w-full px-chrome-md py-chrome-md"
                    placeholder="補充這筆交易的說明"
                  />
                </label>
              </div>

              {formError ? (
                <div className="px-chrome-md pb-chrome-md">
                  <div className="chrome-led-panel border border-danger-light/80 px-chrome-md py-chrome-sm">
                    <p className="font-chrome-mono text-chrome-sm text-danger-light">{formError}</p>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 px-chrome-md pb-chrome-md">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={isEditingPending}
                  className="chrome-btn min-h-11 px-chrome-md py-chrome-md font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isEditingPending}
                  className={cn(
                    "chrome-btn chrome-btn--success min-h-11 px-chrome-md py-chrome-md font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide disabled:cursor-not-allowed",
                    isEditingPending && "opacity-70",
                  )}
                >
                  {isEditingPending ? "saving" : "save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
