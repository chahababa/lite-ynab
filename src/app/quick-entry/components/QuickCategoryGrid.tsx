"use client";

import Link from "next/link";
import {
  Car,
  Coffee,
  CreditCard,
  Heart,
  Home,
  Music,
  Plane,
  ShoppingBag,
  Tag,
  Utensils,
} from "lucide-react";

import {
  CAT_BG_CLASS,
  CAT_BORDER_CLASS,
  CAT_TEXT_CLASS,
  type M3CatIcon,
  getCategoryStyle,
} from "@/lib/categoryStyle";
import { type getAmbiguousCategoryNames, getCategoryDisplay } from "@/lib/categoryDisplay";
import type { CategoryOption } from "@/lib/types";
import { cn } from "@/lib/utils";

import { getGroupBadgeColor, getGroupBadgeText } from "../helpers";

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
  ambiguousNames: ReturnType<typeof getAmbiguousCategoryNames>;
  selectedCategoryId: string;
  handleQuickCategoryTap: (categoryId: string) => void;
  setIsCategoryModalOpen: (open: boolean) => void;
  onRefresh: () => void;
};

export function QuickCategoryGrid({
  loading,
  loadError,
  visibleQuickCategories,
  ambiguousNames,
  selectedCategoryId,
  handleQuickCategoryTap,
  setIsCategoryModalOpen,
  onRefresh,
}: QuickCategoryGridProps) {
  return (
    <section>
      {loading ? (
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-sm bg-surface-container"
            />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-md border border-money-expense bg-money-expense-container px-4 py-3 text-body-sm text-money-expense">
          <p>{loadError}</p>
          <button type="button" onClick={() => onRefresh()} className="mt-2 font-medium underline">
            重新整理頁面
          </button>
        </div>
      ) : visibleQuickCategories.length === 0 ? (
        <div className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
          <p>尚未標記常用分類，先到預算分配把常用小項加入快速記帳。</p>
          <Link href="/budget-allocation" className="mt-2 inline-flex font-medium text-primary underline">
            前往設定快速分類
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-1">
          {visibleQuickCategories.map((category) => {
            const style = getCategoryStyle(category.name);
            const Icon = ICON_COMPONENTS[style.icon];
            const groupBadgeColor = getGroupBadgeColor(category.groupName);
            const isSelected = selectedCategoryId === category.id;
            const display = getCategoryDisplay(category, ambiguousNames);
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => handleQuickCategoryTap(category.id)}
                aria-label={`${category.groupName} ${category.name}`}
                aria-pressed={isSelected}
                className={cn(
                  "flex aspect-[3/4] flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-[10px] transition-colors duration-m3-short",
                  isSelected
                    ? cn(
                        "border-[1.5px]",
                        CAT_BORDER_CLASS[style.color],
                        CAT_TEXT_CLASS[style.color],
                        "bg-on-surface/[0.04]",
                      )
                    : "border border-outline text-on-surface-variant hover:bg-on-surface/[0.03]",
                )}
              >
                <span className="relative inline-flex h-7 w-7 items-center justify-center">
                  <Icon className="h-[22px] w-[22px]" />
                  <span
                    aria-hidden="true"
                    title={`大項：${category.groupName}`}
                    className={cn(
                      "absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white shadow-elev-1 ring-1 ring-surface",
                      CAT_BG_CLASS[groupBadgeColor],
                    )}
                  >
                    {getGroupBadgeText(category.groupName)}
                  </span>
                </span>
                <span className="text-[8px] leading-none opacity-70">
                  #{category.groupName}
                </span>
                <span className="text-[10px] font-medium leading-tight">
                  {display.primary}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsCategoryModalOpen(true)}
        className="mt-1 w-full text-label-md text-on-surface-variant hover:text-on-surface"
      >
        更多分類 →
      </button>
    </section>
  );
}
