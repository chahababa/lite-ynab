"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";

import type { Category, TransactionWithCategory } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

type TransactionListProps = {
  categories: Category[];
  items: TransactionWithCategory[];
  pendingTransactionId: string | null;
  onSave: (input: {
    id: string;
    amount: number;
    date: string;
    categoryId: string;
    note: string;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type DraftState = {
  amount: string;
  date: string;
  categoryId: string;
  note: string;
};

export function TransactionList({
  categories,
  items,
  pendingTransactionId,
  onSave,
  onDelete,
}: TransactionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  useEffect(() => {
    setDrafts(
      items.reduce<Record<string, DraftState>>((accumulator, item) => {
        accumulator[item.id] = {
          amount: item.amount.toString(),
          date: item.date,
          categoryId: item.category_id,
          note: item.note ?? "",
        };
        return accumulator;
      }, {}),
    );
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-ink/20 bg-white/60 p-6 text-sm text-ink/55">
        這個月份還沒有支出紀錄，先從快速記帳開始吧。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const draft = drafts[item.id];
        const isEditing = editingId === item.id;
        const isPending = pendingTransactionId === item.id;

        return (
          <div
            key={item.id}
            className="rounded-[24px] border border-ink/10 bg-white/80 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{item.categoryName}</p>
                <p className="text-sm text-ink/55">
                  {item.date}
                  {item.note ? ` · ${item.note}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl text-ink">{formatCurrency(item.amount)}</p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : item.id)}
                    className="rounded-full border border-ink/10 p-2 text-ink/65 transition hover:border-mint hover:text-mint"
                    aria-label="Edit transaction"
                  >
                    {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    disabled={isPending}
                    className="rounded-full border border-ink/10 p-2 text-ink/65 transition hover:border-coral hover:text-coral disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Delete transaction"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {isEditing && draft ? (
              <div className="mt-4 space-y-3 rounded-2xl bg-paper p-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    inputMode="numeric"
                    value={draft.amount}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          amount: event.target.value.replace(/[^\d]/g, ""),
                        },
                      }))
                    }
                    className="rounded-2xl border border-ink/10 bg-white px-3 py-2 outline-none focus:border-mint"
                  />
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          date: event.target.value,
                        },
                      }))
                    }
                    className="rounded-2xl border border-ink/10 bg-white px-3 py-2 outline-none focus:border-mint"
                  />
                </div>
                <select
                  value={draft.categoryId}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.id]: {
                        ...current[item.id],
                        categoryId: event.target.value,
                      },
                    }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2 outline-none focus:border-mint"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <textarea
                  value={draft.note}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.id]: {
                        ...current[item.id],
                        note: event.target.value,
                      },
                    }))
                  }
                  rows={2}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2 outline-none focus:border-mint"
                  placeholder="備註"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    onSave({
                      id: item.id,
                      amount: Number(draft.amount),
                      date: draft.date,
                      categoryId: draft.categoryId,
                      note: draft.note.trim(),
                    }).then(() => setEditingId(null))
                  }
                  className={cn(
                    "w-full rounded-2xl px-4 py-3 text-sm font-medium text-paper transition",
                    isPending ? "bg-ink/50" : "bg-ink hover:bg-ink/90",
                  )}
                >
                  {isPending ? "更新中" : "更新紀錄"}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
