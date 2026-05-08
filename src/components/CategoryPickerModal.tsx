"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { useModalLifecycle } from "@/lib/hooks/useModalLifecycle";
import { CAT_TEXT_CLASS, getCategoryStyle } from "@/lib/categoryStyle";
import type { CategoryOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type CategoryPickerModalProps = {
  open: boolean;
  allCategories: CategoryOption[];
  onSelect: (categoryId: string) => void;
  onClose: () => void;
  /** Disable list buttons while parent is submitting */
  disabled?: boolean;
};

export function CategoryPickerModal({
  open,
  allCategories,
  onSelect,
  onClose,
  disabled = false,
}: CategoryPickerModalProps) {
  useModalLifecycle({ open, onClose, historyKey: "category-picker" });
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCategories;
    return allCategories.filter((c) =>
      `${c.groupName} ${c.name}`.toLowerCase().includes(q),
    );
  }, [allCategories, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CategoryOption[]>();
    for (const c of filtered) {
      const arr = map.get(c.groupName) ?? [];
      arr.push(c);
      map.set(c.groupName, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="選擇分類"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[360px] flex-col rounded-md bg-surface shadow-elev-3"
        style={{ maxHeight: "80vh" }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <p className="text-title-md text-on-surface">選擇分類</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-5 mt-1 mb-3 flex items-center gap-2 rounded-xs border border-outline-variant bg-surface px-3">
          <Search aria-hidden className="h-4 w-4 text-on-surface-variant" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋分類名稱或群組"
            aria-label="搜尋分類"
            className="h-10 w-full bg-transparent text-body-md text-on-surface outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {grouped.length === 0 ? (
            <p className="px-3 py-3 text-body-md text-on-surface-variant">
              {query.trim() ? "找不到符合搜尋條件的分類" : "目前沒有分類"}
            </p>
          ) : (
            grouped.map(([groupName, items]) => (
              <div key={groupName} className="mb-2">
                <p className="px-3 py-1 text-label-sm uppercase text-on-surface-variant">
                  {groupName}
                </p>
                <ul>
                  {items.map((c) => {
                    const style = getCategoryStyle(c.name);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            onSelect(c.id);
                            onClose();
                          }}
                          aria-label={`${groupName} ${c.name}`}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-body-md text-on-surface transition-colors duration-m3-short",
                            "hover:bg-on-surface/5 active:bg-on-surface/10",
                            "disabled:cursor-not-allowed disabled:opacity-40",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "inline-block h-2 w-2 rounded-full",
                              CAT_TEXT_CLASS[style.color].replace("text-", "bg-"),
                            )}
                          />
                          {c.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
