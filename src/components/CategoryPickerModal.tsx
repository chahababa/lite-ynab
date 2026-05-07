"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { getGroupTone } from "@/lib/groupTone";
import { useModalLifecycle } from "@/lib/hooks/useModalLifecycle";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="chrome-window flex w-full max-w-[320px] flex-col p-[6px]"
        style={{ maxHeight: "80vh" }}
      >
        <div className="chrome-titlebar flex items-center justify-between gap-2 px-chrome-md py-chrome-sm">
          <p className="font-chrome-heading text-chrome-sm font-bold tracking-chrome-wider text-chrome-900">
            選擇分類
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex h-6 w-6 items-center justify-center rounded-chrome-btn border border-chrome-700 bg-chrome-100 text-chrome-900 hover:bg-chrome-50 active:bg-chrome-200"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="mt-chrome-sm flex items-center gap-chrome-sm rounded-chrome-input border border-chrome-700 bg-chrome-100 px-chrome-sm">
          <Search aria-hidden className="h-4 w-4 text-chrome-700" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋分類名稱或群組"
            aria-label="搜尋分類"
            className="min-h-9 w-full bg-transparent py-chrome-sm text-chrome-sm text-chrome-900 outline-none"
          />
        </div>

        <div className="mt-chrome-sm flex-1 overflow-y-auto pr-1">
          {grouped.length === 0 ? (
            <p className="px-chrome-md py-chrome-md text-chrome-sm text-chrome-700">
              {query.trim() ? "找不到符合搜尋條件的分類" : "目前沒有分類"}
            </p>
          ) : (
            grouped.map(([groupName, items]) => {
              const tone = getGroupTone(groupName);
              return (
                <div key={groupName} className="mt-chrome-sm first:mt-0">
                  <p className="mb-chrome-xs flex items-center gap-2 px-chrome-sm font-chrome-heading text-chrome-xs font-bold tracking-chrome-wide text-chrome-800">
                    <span
                      aria-hidden
                      className={cn("inline-block h-1.5 w-1.5 rounded-full", tone.dot)}
                    />
                    {groupName}
                  </p>
                  <ul>
                    {items.map((c) => (
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
                            "mt-chrome-xs flex w-full items-center justify-between rounded-chrome-btn border border-chrome-700 bg-chrome-100 px-chrome-md py-chrome-sm text-left font-chrome-body text-chrome-sm text-chrome-900 transition-colors duration-fast",
                            "hover:bg-chrome-50 active:bg-chrome-200",
                            "disabled:cursor-not-allowed disabled:bg-chrome-200 disabled:text-chrome-600",
                          )}
                        >
                          <span>{c.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
