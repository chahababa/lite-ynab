"use client";

import { useMemo } from "react";
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

import { MoneyText } from "@/components/m3/MoneyText";
import { Progress } from "@/components/m3/Progress";
import { CAT_BG_CLASS, CAT_TEXT_CLASS, type M3CatIcon, getCategoryStyle } from "@/lib/categoryStyle";
import { getAmbiguousCategoryNames, getCategoryDisplay } from "@/lib/categoryDisplay";
import { cn } from "@/lib/utils";

import type { MonthView } from "../helpers";

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

function formatMoney(value: number) {
  return `$${Math.abs(value).toLocaleString("en-US")}`;
}

/** 「本月」頁的內容：上方一個大數字，下方各分類剩多少。 */
export function MonthOverview({ view }: { view: MonthView }) {
  const ambiguousNames = useMemo(() => getAmbiguousCategoryNames(view.items), [view.items]);
  const isOver = view.remaining < 0;

  return (
    <>
      {/* 總覽：一個大數字回答「這個月還能花多少」 */}
      <section className="rounded-md border border-outline bg-surface p-5">
        <p className="text-label-md text-on-surface-variant">{isOver ? "已經超支" : "還能花"}</p>
        <div className="mt-1">
          <MoneyText
            value={Math.abs(view.remaining)}
            type={isOver ? "warn" : "remain"}
            size="display"
          />
        </div>
        <Progress
          value={view.percent}
          variant={isOver ? "expense" : "primary"}
          className="mt-4"
          ariaLabel={`本月預算已使用 ${view.percent}%`}
        />
        <p className="mt-2 font-mono tabular-nums text-body-sm text-on-surface-variant">
          已花 {formatMoney(view.spent)} / 預算 {formatMoney(view.available)}
        </p>
        {view.dailyAllowance !== null && view.daysLeft !== null ? (
          <p className="mt-1 text-body-sm text-on-surface-variant">
            本月還有 {view.daysLeft} 天，平均每天可以花{" "}
            <span className="font-mono tabular-nums text-on-surface">
              {formatMoney(view.dailyAllowance)}
            </span>
          </p>
        ) : null}
      </section>

      {/* 各分類 */}
      <section>
        <div className="mb-2 flex items-center justify-between pl-1">
          <h2 className="text-title-sm">各分類</h2>
          <Link
            href="/budget-allocation"
            className="rounded-full px-3 py-1.5 text-label-md text-primary transition-colors duration-m3-short hover:bg-primary/10 active:bg-primary/15"
          >
            調整預算
          </Link>
        </div>
        {view.items.length === 0 ? (
          <p className="rounded-md bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
            這個月還沒有預算，也沒有花費。
          </p>
        ) : (
          <div className="rounded-md border border-outline bg-surface">
            {view.items.map((item, index) => {
              const style = getCategoryStyle(item.name);
              const Icon = ICON_COMPONENTS[style.icon];
              const available = item.allocated + item.carryover;
              const percent =
                available > 0
                  ? Math.min(100, Math.round((item.spent / available) * 100))
                  : item.spent > 0
                    ? 100
                    : 0;
              const display = getCategoryDisplay(item, ambiguousNames);
              return (
                <div key={item.id} className={cn("px-4 py-3", index > 0 && "border-t border-outline")}>
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
                        `${CAT_BG_CLASS[style.color]}/15`,
                        CAT_TEXT_CLASS[style.color],
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-md font-medium text-on-surface">
                        {display.secondary ? (
                          <span className="text-label-sm font-normal text-on-surface-variant">
                            {display.secondary} ·{" "}
                          </span>
                        ) : null}
                        {display.primary}
                      </p>
                      <p className="font-mono tabular-nums text-label-sm text-on-surface-variant">
                        已花 {formatMoney(item.spent)}
                        {available > 0 ? ` / ${formatMoney(available)}` : "（沒有預算）"}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 text-right font-mono tabular-nums text-title-sm",
                        item.isOverspent ? "text-money-warn" : "text-on-surface",
                      )}
                    >
                      {item.isOverspent ? "超 " : "剩 "}
                      {formatMoney(item.remaining)}
                    </p>
                  </div>
                  <Progress
                    value={percent}
                    variant={item.isOverspent ? "expense" : "primary"}
                    className="mt-2"
                    ariaLabel={`${item.name} 預算使用 ${percent}%`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
