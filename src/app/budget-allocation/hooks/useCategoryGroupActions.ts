"use client";

import { useState } from "react";

import type { BudgetRow } from "@/lib/types";

import { getErrorMessage } from "../helpers";
import type {
  CompactGroup,
  ConfirmDialogState,
  SetPendingKey,
  SetState,
  SetToast,
  SupabaseBrowserClient,
  TextDialogState,
} from "../types";

type UseCategoryGroupActionsArgs = {
  supabase: SupabaseBrowserClient;
  rows: BudgetRow[];
  setRows: SetState<BudgetRow[]>;
  groupedRows: CompactGroup[];
  setPendingKey: SetPendingKey;
  setToast: SetToast;
  setConfirmDialog: SetState<ConfirmDialogState | null>;
  openTextDialog: (config: TextDialogState) => void;
};

/** Category group (大項) actions: collapse/expand, rename, reorder, delete. */
export function useCategoryGroupActions({
  supabase,
  rows,
  setRows,
  groupedRows,
  setPendingKey,
  setToast,
  setConfirmDialog,
  openTextDialog,
}: UseCategoryGroupActionsArgs) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  function toggleGroup(groupId: string) {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  function renameGroup(group: CompactGroup) {
    openTextDialog({
      title: "重新命名大項",
      label: "大項名稱",
      initialValue: group.groupName,
      confirmLabel: "儲存名稱",
      onConfirm: async (nextName) => {
        if (nextName === group.groupName) return;
        setPendingKey(`group-rename-${group.groupId}`);
        try {
          const { error } = await supabase.from("category_groups").update({ name: nextName }).eq("id", group.groupId);
          if (error) throw error;
          setRows((current) =>
            current.map((item) =>
              item.categoryGroupId === group.groupId ? { ...item, categoryGroupName: nextName } : item,
            ),
          );
          setToast({ tone: "success", message: `已將大項更新為「${nextName}」。` });
        } catch (error) {
          setToast({ tone: "error", message: `重新命名大項失敗：${getErrorMessage(error)}` });
        } finally {
          setPendingKey(null);
        }
      },
    });
  }

  async function reorderGroups(groupId: string, direction: -1 | 1) {
    const groups = groupedRows;
    const currentIndex = groups.findIndex((group) => group.groupId === groupId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= groups.length) {
      return;
    }

    setPendingKey(`group-sort-${groupId}`);

    try {
      const nextGroups = [...groups];
      const [moved] = nextGroups.splice(currentIndex, 1);
      nextGroups.splice(targetIndex, 0, moved);

      const nextRows = nextGroups.flatMap((group) =>
        rows.filter((row) => row.categoryGroupId === group.groupId),
      );

      const updates = nextGroups.map((group, index) =>
        supabase.from("category_groups").update({ sort_order: (index + 1) * 10 }).eq("id", group.groupId),
      );
      const responses = await Promise.all(updates);
      const failed = responses.find((item) => item.error);
      if (failed?.error) {
        throw failed.error;
      }

      setRows(nextRows);
      setToast({ tone: "success", message: "已更新大項排序。" });
    } catch (error) {
      setToast({ tone: "error", message: `更新大項排序失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteGroup(group: CompactGroup, confirmed = false) {
    if (!confirmed) {
      setConfirmDialog({
        title: `刪除大項「${group.groupName}」`,
        description: `這會一起刪除底下 ${group.rows.length} 個小項、相關預算與交易資料，且無法復原。`,
        confirmLabel: "確認刪除大項",
        tone: "danger",
        onConfirm: () => deleteGroup(group, true),
      });
      return;
    }

    setPendingKey(`group-delete-${group.groupId}`);

    try {
      const { error } = await supabase.from("category_groups").delete().eq("id", group.groupId);
      if (error) {
        throw error;
      }

      setRows((current) => current.filter((item) => item.categoryGroupId !== group.groupId));
      setToast({
        tone: "success",
        message: `已刪除大項「${group.groupName}」，相關小項、預算與交易也已移除。`,
      });
    } catch (error) {
      setToast({ tone: "error", message: `刪除大項失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  return { collapsedGroups, toggleGroup, renameGroup, reorderGroups, deleteGroup };
}
