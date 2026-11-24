"use client";

import { useState } from "react";

import type { BudgetRow } from "@/lib/types";

import { createCategoryWithBudget, getErrorMessage } from "../helpers";
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
  monthId: string;
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
  monthId,
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

  // Two steps: 大項名稱 → 第一個小項名稱. Nothing is written until the second step is confirmed,
  // because this page only shows groups that have at least one category.
  function addGroup() {
    openTextDialog({
      title: "新增大項",
      label: "大項名稱（例如：寵物、旅遊）",
      confirmLabel: "下一步",
      onConfirm: (groupName) => {
        const shown = groupedRows.find((group) => group.groupName === groupName);
        if (shown) {
          setToast({ tone: "error", message: `已經有「${groupName}」這個大項了，可以直接在它底下新增小項。` });
          return;
        }
        openTextDialog({
          title: `「${groupName}」的第一個小項`,
          label: "小項名稱（例如：飼料、機票）",
          confirmLabel: "新增大項與小項",
          onConfirm: async (categoryName) => {
            setPendingKey("group-add");
            try {
              // A group left without categories is hidden on this page but still exists; reuse it.
              const existing = await supabase.from("category_groups").select("id").eq("name", groupName).maybeSingle();
              if (existing.error) throw existing.error;
              let groupId = existing.data?.id as string | undefined;
              const created = !groupId;
              if (!groupId) {
                const last = await supabase
                  .from("category_groups")
                  .select("sort_order")
                  .order("sort_order", { ascending: false })
                  .limit(1);
                if (last.error) throw last.error;
                const inserted = await supabase
                  .from("category_groups")
                  .insert({ name: groupName, sort_order: Number(last.data?.[0]?.sort_order ?? 0) + 10 })
                  .select("id")
                  .single();
                if (inserted.error || !inserted.data) throw inserted.error ?? new Error("新增大項失敗");
                groupId = inserted.data.id as string;
              }
              try {
                const row = await createCategoryWithBudget(supabase, monthId, { groupId, groupName }, categoryName, 10);
                setRows((current) => [...current, row]);
              } catch (error) {
                if (created) await supabase.from("category_groups").delete().eq("id", groupId);
                throw error;
              }
              setToast({ tone: "success", message: `已新增大項「${groupName}」與小項「${categoryName}」。` });
            } catch (error) {
              setToast({ tone: "error", message: `新增大項失敗：${getErrorMessage(error)}` });
            } finally {
              setPendingKey(null);
            }
          },
        });
      },
    });
  }

  return { collapsedGroups, toggleGroup, renameGroup, reorderGroups, deleteGroup, addGroup };
}
