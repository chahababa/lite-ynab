"use client";

import { Settings } from "lucide-react";

import type { CompactGroup, GroupMenuHandlers } from "../types";

type BudgetGroupMenuProps = GroupMenuHandlers & {
  group: CompactGroup;
  pendingKey: string | null;
};

export function BudgetGroupMenu({
  group,
  pendingKey,
  openGroupMenuId,
  setOpenGroupMenuId,
  reorderGroups,
  renameGroup,
  addCategoryToGroup,
  deleteGroup,
}: BudgetGroupMenuProps) {
  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
        aria-label={`${group.groupName} 設定`}
        onClick={() => setOpenGroupMenuId((current) => (current === group.groupId ? null : group.groupId))}
      >
        <Settings className="h-4 w-4" />
      </button>
      {openGroupMenuId === group.groupId ? (
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-outline bg-surface p-1 shadow-elev-2">
          <button
            type="button"
            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-on-surface hover:bg-on-surface/5 disabled:opacity-40"
            onClick={() => void reorderGroups(group.groupId, -1)}
            disabled={pendingKey === `group-sort-${group.groupId}`}
          >
            大項上移
          </button>
          <button
            type="button"
            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-on-surface hover:bg-on-surface/5 disabled:opacity-40"
            onClick={() => void reorderGroups(group.groupId, 1)}
            disabled={pendingKey === `group-sort-${group.groupId}`}
          >
            大項下移
          </button>
          <button
            type="button"
            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-on-surface hover:bg-on-surface/5 disabled:opacity-40"
            onClick={() => void renameGroup(group)}
            disabled={pendingKey === `group-rename-${group.groupId}`}
          >
            重新命名
          </button>
          <button
            type="button"
            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-primary hover:bg-primary/5 disabled:opacity-40"
            onClick={() => void addCategoryToGroup(group)}
            disabled={pendingKey === `add-${group.groupId}`}
          >
            {pendingKey === `add-${group.groupId}` ? "新增中" : "新增小項目"}
          </button>
          <button
            type="button"
            className="block w-full rounded-sm px-3 py-2 text-left text-body-sm text-money-expense hover:bg-money-expense/5 disabled:opacity-40"
            onClick={() => void deleteGroup(group)}
            disabled={pendingKey === `group-delete-${group.groupId}`}
          >
            刪除大項
          </button>
        </div>
      ) : null}
    </div>
  );
}
