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
  CAT_BORDER_CLASS,
  CAT_TEXT_CLASS,
  type M3CatIcon,
  getCategoryStyle,
} from "@/lib/categoryStyle";
import { type getAmbiguousCategoryNames, getCategoryDisplay } from "@/lib/categoryDisplay";
import type { QuickBudgetStatus } from "@/lib/data";
import type { CategoryOption } from "@/lib/types";
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

const PRIMARY_TILE_COUNT = 2;

type QuickCategoryGridProps = {
  loading: boolean;
  loadError: string | null;
  visibleQuickCategories: CategoryOption[];
  ambiguousNames: ReturnType<typeof getAmbiguousCategoryNames>;
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
  ambiguousNames,
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
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-md bg-surface-container" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-surface-container" />
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

  const primaryTiles = visibleQuickCategories.slice(0, PRIMARY_TILE_COUNT);
  const secondaryTiles = visibleQuickCategories.slice(PRIMARY_TILE_COUNT);

  function renderTile(category: CategoryOption, size: "primary" | "secondary") {
    const style = getCategoryStyle(category.name);
    const Icon = ICON_COMPONENTS[style.icon];
    const isSelected = selectedCategoryId === category.id;
    const display = getCategoryDisplay(category, ambiguousNames);
    const hint = getBudgetHint(budgetStatusByCategory[category.id]);

    return (
      <button
        key={category.id}
        type="button"
        onClick={() => handleQuickCategoryTap(category.id)}
        aria-label={`${category.groupName} ${category.name}`}
        aria-pressed={isSelected}
        className={cn(
          "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-2 transition-colors duration-m3-short",
          size === "primary" ? "h-[72px]" : "h-14",
          isSelected
            ? cn(
                "border-2 bg-on-surface/[0.04]",
                CAT_BORDER_CLASS[style.color],
                CAT_TEXT_CLASS[style.color],
              )
            : "border border-outline text-on-surface hover:bg-on-surface/[0.04] active:bg-on-surface/[0.08]",
        )}
      >
        <span className="flex max-w-full items-center gap-1">
          {size === "primary" ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
          <span
            className={cn(
              "truncate font-medium",
              size === "primary" ? "text-body-md" : "text-label-md",
            )}
          >
            {display.secondary ? `${display.secondary}・${display.primary}` : display.primary}
          </span>
        </span>
        {hint ? (
          <span
            className={cn(
              "max-w-full truncate font-mono",
              size === "primary" ? "text-label-md" : "text-label-sm",
              hint.isOver ? "text-money-warn" : "text-on-surface-variant",
            )}
          >
            {hint.text}
          </span>
        ) : null}
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
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {primaryTiles.map((category) => renderTile(category, "primary"))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {secondaryTiles.map((category) => renderTile(category, "secondary"))}
        <button
          type="button"
          onClick={() => setIsCategoryModalOpen(true)}
          aria-label="其他分類"
          className="flex h-14 items-center justify-center gap-1.5 rounded-md border border-outline-variant px-2 text-on-surface-variant transition-colors duration-m3-short hover:bg-on-surface/[0.04] active:bg-on-surface/[0.08]"
        >
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          <span className="text-label-md font-medium">其他分類</span>
        </button>
      </div>
    </section>
  );
}
