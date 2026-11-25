"use client";

import { SUGGESTION_MONTHS } from "@/lib/budgetSuggestion";

type PlanningShortcutsCardProps = {
  pendingKey: string | null;
  copyPreviousMonthBudgets: (confirmed?: boolean) => Promise<void>;
  applyAutoBudgets: (confirmed?: boolean) => Promise<void>;
  applySuggestedBudgets: (confirmed?: boolean) => Promise<void>;
  suggestionCount: number;
};

export function PlanningShortcutsCard({
  pendingKey,
  copyPreviousMonthBudgets,
  applyAutoBudgets,
  applySuggestedBudgets,
  suggestionCount,
}: PlanningShortcutsCardProps) {
  return (
    <section className="rounded-md border border-outline bg-surface p-4">
      <h2 className="mb-3 text-title-md">月初規劃捷徑</h2>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-full border border-outline-variant bg-transparent px-4 text-body-md font-medium text-primary transition-colors duration-m3-short hover:bg-primary/5 active:bg-primary/10 disabled:opacity-40"
          onClick={() => void copyPreviousMonthBudgets()}
          disabled={pendingKey === "copy"}
        >
          {pendingKey === "copy" ? "複製中" : "複製上月預算"}
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-body-md font-medium text-primary-on transition-colors duration-m3-short hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40"
          onClick={() => void applyAutoBudgets()}
          disabled={pendingKey === "auto-all"}
        >
          {pendingKey === "auto-all" ? "套用中" : "批次套用固定預算"}
        </button>
        <button
          type="button"
          className="col-span-2 inline-flex h-10 items-center justify-center rounded-full border border-outline-variant bg-transparent px-4 text-body-md font-medium text-primary transition-colors duration-m3-short hover:bg-primary/5 active:bg-primary/10 disabled:opacity-40"
          onClick={() => void applySuggestedBudgets()}
          disabled={pendingKey === "suggest-all" || suggestionCount === 0}
        >
          {pendingKey === "suggest-all" ? "套用中" : "套用建議預算"}
        </button>
      </div>
      <p className="mt-2 text-label-sm text-on-surface-variant">
        {suggestionCount > 0
          ? `建議預算依近 ${SUGGESTION_MONTHS} 個月的實際花費計算，目前有 ${suggestionCount} 個小項有建議；套用前會先列出調整內容。`
          : `建議預算依近 ${SUGGESTION_MONTHS} 個月的實際花費計算，這個月份前面的紀錄還不夠，暫時沒有建議。`}
      </p>
    </section>
  );
}
