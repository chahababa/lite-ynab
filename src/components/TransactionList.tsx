"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Car,
  Coffee,
  CreditCard,
  Heart,
  Home,
  Music,
  Pencil,
  Plane,
  ShoppingBag,
  Tag,
  Trash2,
  Utensils,
  X,
} from "lucide-react";

import { Button as M3Button } from "@/components/m3/Button";
import { MoneyText } from "@/components/m3/MoneyText";
import {
  CAT_BG_CLASS,
  CAT_TEXT_CLASS,
  type M3CatIcon,
  getCategoryStyle,
} from "@/lib/categoryStyle";
import type {
  CategoryOption,
  PaymentMethodOption,
  TransactionWithCategory,
} from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(
      items.reduce<Record<string, DraftState>>((acc, item) => {
        acc[item.id] = {
          amount: item.amount.toString(),
          date: item.date,
          categoryId: item.category_id,
          paymentMethodId: item.payment_method_id,
          note: item.note ?? "",
        };
        return acc;
      }, {}),
    );
  }, [items]);

  useEffect(() => {
    if (!editingId && !confirmDeleteId) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [confirmDeleteId, editingId]);

  const editingItem = useMemo(
    () => items.find((i) => i.id === editingId) ?? null,
    [editingId, items],
  );
  const confirmDeleteItem = useMemo(
    () => items.find((i) => i.id === confirmDeleteId) ?? null,
    [confirmDeleteId, items],
  );
  const editingDraft = editingId ? drafts[editingId] : undefined;
  const isEditingPending =
    editingId !== null && pendingTransactionId === editingId;
  const isDeletePending =
    confirmDeleteId !== null && pendingTransactionId === confirmDeleteId;

  function openEditor(itemId: string) {
    setEditingId(itemId);
    setFormError(null);
  }
  function closeEditor() {
    if (isEditingPending) return;
    setEditingId(null);
    setFormError(null);
  }
  function closeDeleteConfirm() {
    if (isDeletePending) return;
    setConfirmDeleteId(null);
  }

  function updateDraft(field: keyof DraftState, value: string) {
    if (!editingId) return;
    setDrafts((current) => ({
      ...current,
      [editingId]: { ...current[editingId], [field]: value },
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
    const ok = await onSave({
      id: editingId,
      amount: Number(editingDraft.amount),
      date: editingDraft.date,
      categoryId: editingDraft.categoryId,
      paymentMethodId: editingDraft.paymentMethodId,
      note: editingDraft.note.trim(),
    });
    if (ok) closeEditor();
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    const ok = await onDelete(confirmDeleteId);
    if (ok) setConfirmDeleteId(null);
  }

  if (items.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-body-sm text-on-surface-variant">
        目前還沒有符合條件的交易資料。
      </p>
    );
  }

  return (
    <>
      <ul>
        {items.map((item, i) => {
          const isPending = pendingTransactionId === item.id;
          const style = getCategoryStyle(item.categoryName);
          const Icon = ICON_COMPONENTS[style.icon];
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-3 px-5 py-3.5",
                i > 0 && "border-t border-outline",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  `${CAT_BG_CLASS[style.color]}/15`,
                  CAT_TEXT_CLASS[style.color],
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-md font-medium">
                  {item.note || item.categoryName}
                </p>
                <p className="truncate text-body-sm text-on-surface-variant">
                  {item.categoryGroupName} · {item.categoryName} ·{" "}
                  {item.paymentMethodName} · {item.date}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <MoneyText value={item.amount} type="expense" size="body" />
                <button
                  type="button"
                  onClick={() => openEditor(item.id)}
                  disabled={isPending}
                  aria-label="編輯交易"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/5 active:bg-on-surface/10 disabled:opacity-40"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(item.id)}
                  disabled={isPending}
                  aria-label="刪除交易"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-money-expense hover:bg-money-expense/5 active:bg-money-expense/10 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Edit modal */}
      {editingItem && editingDraft ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="編輯交易"
          onClick={closeEditor}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-md bg-surface shadow-elev-3 sm:rounded-md"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <p className="text-label-md text-on-surface-variant">編輯交易</p>
                <p className="text-title-md text-on-surface">
                  ${Number(editingDraft.amount || 0).toLocaleString("en-US")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                disabled={isEditingPending}
                aria-label="關閉編輯交易視窗"
                className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 pb-3">
              <label className="block">
                <span className="mb-1 block text-label-md text-on-surface-variant">
                  金額
                </span>
                <input
                  inputMode="numeric"
                  value={editingDraft.amount}
                  disabled={isEditingPending}
                  onChange={(e) =>
                    updateDraft("amount", e.target.value.replace(/[^\d]/g, ""))
                  }
                  className="h-11 w-full rounded-xs border border-outline-variant bg-surface px-4 text-center font-mono text-body-lg tabular-nums text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[15px]"
                  placeholder="0"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-label-md text-on-surface-variant">
                    日期
                  </span>
                  <input
                    type="date"
                    value={editingDraft.date}
                    disabled={isEditingPending}
                    onChange={(e) => updateDraft("date", e.target.value)}
                    className="h-10 w-full rounded-xs border border-outline-variant bg-surface px-3 text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-label-md text-on-surface-variant">
                    支付方式
                  </span>
                  <select
                    value={editingDraft.paymentMethodId}
                    disabled={isEditingPending}
                    onChange={(e) => updateDraft("paymentMethodId", e.target.value)}
                    className="h-10 w-full rounded-xs border border-outline-variant bg-surface px-3 text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
                  >
                    {paymentMethods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-label-md text-on-surface-variant">
                  分類
                </span>
                <select
                  value={editingDraft.categoryId}
                  disabled={isEditingPending}
                  onChange={(e) => updateDraft("categoryId", e.target.value)}
                  className="h-10 w-full rounded-xs border border-outline-variant bg-surface px-3 text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.groupName} / {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-label-md text-on-surface-variant">
                  備註
                </span>
                <textarea
                  value={editingDraft.note}
                  disabled={isEditingPending}
                  onChange={(e) => updateDraft("note", e.target.value)}
                  rows={3}
                  className="w-full rounded-xs border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
                  placeholder="例如：午餐、家用品、交通補票"
                />
              </label>

              {formError ? (
                <div className="rounded-md bg-money-expense-container px-3 py-2 text-body-sm text-money-expense">
                  {formError}
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 px-5 pb-5">
              <M3Button
                variant="text"
                onClick={closeEditor}
                disabled={isEditingPending}
              >
                取消
              </M3Button>
              <M3Button
                variant="filled"
                onClick={() => void handleSave()}
                disabled={isEditingPending}
              >
                {isEditingPending ? "儲存中" : "儲存"}
              </M3Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirm */}
      {confirmDeleteItem ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="確認刪除交易"
          onClick={closeDeleteConfirm}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[320px] rounded-md bg-surface shadow-elev-3"
          >
            <div className="px-5 pt-5 pb-3">
              <p className="text-title-md text-on-surface">
                確定要刪除這筆交易嗎？
              </p>
              <p className="mt-2 text-body-sm text-on-surface-variant">
                {confirmDeleteItem.categoryName} ·{" "}
                <span className="font-mono tabular-nums">
                  ${confirmDeleteItem.amount.toLocaleString("en-US")}
                </span>{" "}
                · {confirmDeleteItem.date}
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <M3Button
                variant="text"
                onClick={closeDeleteConfirm}
                disabled={isDeletePending}
              >
                取消
              </M3Button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isDeletePending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-money-expense px-6 font-sans text-body-md font-medium text-white transition-colors duration-m3-short hover:bg-money-expense/90 active:bg-money-expense/80 disabled:opacity-40"
              >
                {isDeletePending ? "刪除中" : "確定刪除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
