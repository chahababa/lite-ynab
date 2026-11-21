"use client";

import { ChevronDown, ChevronRight } from "lucide-react";

import { BudgetCategoryRow } from "./BudgetCategoryRow";
import { BudgetGroupMenu } from "./BudgetGroupMenu";
import type { CategoryRowHandlers, CompactGroup, GroupMenuHandlers, PreviousReference } from "../types";

type BudgetGroupSectionProps = {
  group: CompactGroup;
  pendingKey: string | null;
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (groupId: string) => void;
  previousReferenceMap: Record<string, PreviousReference>;
  groupMenu: GroupMenuHandlers;
  categoryRow: CategoryRowHandlers;
};

export function BudgetGroupSection({
  group,
  pendingKey,
  collapsedGroups,
  toggleGroup,
  previousReferenceMap,
  groupMenu,
  categoryRow,
}: BudgetGroupSectionProps) {
  return (
    <section className="rounded-md border border-outline bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-outline px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
            aria-label={`${group.groupName} ${collapsedGroups[group.groupId] ? "展開" : "收合"}`}
            onClick={() => toggleGroup(group.groupId)}
          >
            {collapsedGroups[group.groupId] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <span className="text-title-sm">{group.groupName}</span>
          <span className="rounded-full bg-secondary-container px-2 py-0.5 text-label-sm text-secondary-on-container">
            {group.rows.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden font-mono text-body-sm tabular-nums text-on-surface-variant sm:block">
            ${group.rows.reduce((sum, row) => sum + row.allocated, 0).toLocaleString("en-US")}
          </p>
          <BudgetGroupMenu group={group} pendingKey={pendingKey} {...groupMenu} />
        </div>
      </div>

      {!collapsedGroups[group.groupId] ? (
        <div className="overflow-x-auto p-3">
          <div className="min-w-[760px] lg:min-w-0">
            <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,0.72fr)_minmax(0,0.72fr)_minmax(0,0.82fr)_minmax(0,0.82fr)] gap-2 border-b border-outline pb-2 text-label-sm uppercase tracking-wider text-on-surface-variant">
            <p className="pl-2">小項</p>
            <p className="text-center">上月分配</p>
            <p className="text-center">上月支出</p>
            <p className="text-center">固定預算</p>
            <p className="text-center">本月預算</p>
          </div>

          <div className="space-y-2 pt-2">
            {group.rows.map((row) => {
              const previous = previousReferenceMap[row.categoryId] ?? {
                allocated: 0,
                spent: 0,
              };
              return (
                <BudgetCategoryRow
                  key={row.budgetId}
                  row={row}
                  previous={previous}
                  pendingKey={pendingKey}
                  {...categoryRow}
                />
              );
            })}
          </div>
          </div>
        </div>
      ) : (
        <p className="px-5 py-3 text-body-sm text-on-surface-variant">
          已收合，點左側箭頭可展開查看小項與預算欄位。
        </p>
      )}
    </section>
  );
}
