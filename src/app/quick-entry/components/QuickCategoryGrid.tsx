"use client";

import Link from "next/link";
import {
  Car,
  Coffee,
  CreditCard,
  Heart,
  Home,
  LayoutGrid,
  Music,
  Plane,
  ShoppingBag,
  Tag,
  Utensils,
} from "lucide-react";

import {
  CAT_TEXT_CLASS,
  type M3CatIcon,
  getCategoryStyle,
} from "@/lib/categoryStyle";
import { CATEGORY_TILE_CLASS } from "@/components/categoryTileClass";
import { getShortCategoryName } from "@/lib/categoryDisplay";
import type { QuickBudgetStatus } from "@/lib/data";
import type { CategoryOption } from "@/lib/types";
import { cn } from "@/lib/utils";

import { getGroupBadgeColor } from "../helpers";

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

type QuickCategoryGridProps = {
  loading: boolean;
  loadError: string | null;
  visibleQuickCategories: CategoryOption[];
  budgetStatusByCategory: Record<string, QuickBudgetStatus>;
  selectedCategoryId: string;
  handleQuickCategoryTap: (categoryId: string) => void;
  setIsCategoryModalOpen: (open: boolean) => void;
  onRefresh: () => void;
};

/** 格子上的預算提示：有預算顯示「剩／超」，沒預算但有花費顯示「已花」。 */
export function getBudgetHint(status: QuickBudgetStatus | undefined): {
  text: string;
  isOver: boolean;
} | null {
  if (!status) return null;

  const format = (value: number) => `$${Math.abs(value).toLocaleString("en-US")}`;

  if (status.available > 0) {
    const remaining = status.available - status.spent;
    return remaining >= 0
      ? { text: `剩 ${format(remaining)}`, isOver: false }
      : { text: `超 ${format(remaining)}`, isOver: true };
  }

  return status.spent > 0 ? { text: `已花 ${format(status.spent)}`, isOver: false } : null;
}

export function QuickCategoryGrid({
  loading,
  loadError,
  visibleQuickCategories,
  budgetStatusByCategory,
  selectedCategoryId,
  handleQuickCategoryTap,
  setIsCategoryModalOpen,
  onRefresh,
}: QuickCategoryGridProps) {
  if (loading) {
    return (
      <section className="flex flex-col gap-2" aria-busy="true">
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[60px] animate-pulse rounded-md bg-surface-container" />
          ))}
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-md border border-money-expense bg-money-expense-container px-4 py-3 text-body-sm text-money-expense">
        <p>{loadError}</p>
        <button type="button" onClick={() => onRefresh()} className="mt-2 font-medium underline">
          重新整理頁面
        </button>
      </section>
    );
  }

  // 每一格：整格淡色底＋左側色條代表大項（個人、家庭…），圖示代表分類內容。
  function renderTile(category: CategoryOption) {
    const shortName = getShortCategoryName(category.name, category.groupName);
    const Icon = ICON_COMPONENTS[getCategoryStyle(shortName).icon];
    const groupColor = getGroupBadgeColor(category.groupName);
    const isSelected = selectedCategoryId === category.id;
    const hint = getBudgetHint(budgetStatusByCategory[category.id]);

    return (
      <button
        key={category.id}
        type="button"
        onClick={() => handleQuickCategoryTap(category.id)}
        aria-label={`${category.groupName} ${category.name}`}
        aria-pressed={isSelected}
        className={cn(
          "flex h-[60px] min-w-0 items-center gap-2 rounded-md border-l-4 pl-2.5 pr-2 text-left transition-colors duration-m3-short",
          isSelected
            ? cn("ring-2 ring-inset ring-on-surface/60", CATEGORY_TILE_CLASS[groupColor].selected)
            : CATEGORY_TILE_CLASS[groupColor].idle,
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", CAT_TEXT_CLASS[groupColor])} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body-md font-medium text-on-surface">{shortName}</span>
          <span className="flex min-w-0 items-baseline gap-1.5 text-label-sm">
            <span className={cn("shrink-0 font-medium", CAT_TEXT_CLASS[groupColor])}>
              {category.groupName}
            </span>
            {hint ? (
              <span
                className={cn(
                  "truncate font-mono",
                  hint.isOver ? "text-money-warn" : "text-on-surface-variant",
                )}
              >
                {hint.text}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      {visibleQuickCategories.length === 0 ? (
        <div className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
          <p>還沒有常用分類。記過幾筆之後，最常用的分類會自動出現在這裡。</p>
          <Link href="/budget-allocation" className="mt-2 inline-flex font-medium text-primary underline">
            前往管理分類
          </Link>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {visibleQuickCategories.map((category) => renderTile(category))}
        <button
          type="button"
          onClick={() => setIsCategoryModalOpen(true)}
          aria-label="其他分類"
          className="flex h-[60px] items-center justify-center gap-1.5 rounded-md border border-outline-variant px-2 text-on-surface-variant transition-colors duration-m3-short hover:bg-on-surface/[0.04] active:bg-on-surface/[0.08]"
        >
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          <span className="text-label-md font-medium">其他分類</span>
        </button>
      </div>
    </section>
  );
}
