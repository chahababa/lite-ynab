"use client";

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

type UseCategoryActionsArgs = {
  supabase: SupabaseBrowserClient;
  monthId: string;
  setRows: SetState<BudgetRow[]>;
  setOpenMenuId: SetState<string | null>;
  setPendingKey: SetPendingKey;
  setToast: SetToast;
  setConfirmDialog: SetState<ConfirmDialogState | null>;
  openTextDialog: (config: TextDialogState) => void;
};

/** Category (小項) actions: quick-entry toggle, rename, delete, add to a group. */
export function useCategoryActions({
  supabase,
  monthId,
  setRows,
  setOpenMenuId,
  setPendingKey,
  setToast,
  setConfirmDialog,
  openTextDialog,
}: UseCategoryActionsArgs) {
  async function toggleQuickEntry(row: BudgetRow) {
    setPendingKey(`quick-${row.categoryId}`);

    try {
      const nextQuick = !row.isQuick;
      const { error } = await supabase.from("categories").update({ is_quick: nextQuick }).eq("id", row.categoryId);

      if (error) {
        throw error;
      }

      setRows((current) =>
        current.map((item) => (item.categoryId === row.categoryId ? { ...item, isQuick: nextQuick } : item)),
      );
      setOpenMenuId(null);
      setToast({
        tone: "success",
        message: nextQuick ? `${row.categoryName} 已加入快速記帳。` : `${row.categoryName} 已從快速記帳移除。`,
      });
    } catch (error) {
      setToast({ tone: "error", message: `更新快速記帳失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  function renameCategory(row: BudgetRow) {
    openTextDialog({
      title: "重新命名小項",
      label: "小項名稱",
      initialValue: row.categoryName,
      confirmLabel: "儲存名稱",
      onConfirm: async (nextName) => {
        if (nextName === row.categoryName) return;
        setPendingKey(`rename-${row.categoryId}`);
        try {
          const { error } = await supabase.from("categories").update({ name: nextName }).eq("id", row.categoryId);
          if (error) throw error;
          setRows((current) =>
            current.map((item) => (item.categoryId === row.categoryId ? { ...item, categoryName: nextName } : item)),
          );
          setOpenMenuId(null);
          setToast({ tone: "success", message: `已將小項名稱更新為「${nextName}」。` });
        } catch (error) {
          setToast({ tone: "error", message: `重新命名失敗：${getErrorMessage(error)}` });
        } finally {
          setPendingKey(null);
        }
      },
    });
  }

  async function deleteCategory(row: BudgetRow, confirmed = false) {
    if (!confirmed) {
      setConfirmDialog({
        title: `刪除小項「${row.categoryName}」`,
        description: "這會一起刪除這個小項的本月預算與相關交易紀錄，且無法復原。",
        confirmLabel: "確認刪除小項",
        tone: "danger",
        onConfirm: () => deleteCategory(row, true),
      });
      return;
    }

    setPendingKey(`delete-${row.categoryId}`);

    try {
      const { error } = await supabase.from("categories").delete().eq("id", row.categoryId);

      if (error) {
        throw error;
      }

      setRows((current) => current.filter((item) => item.categoryId !== row.categoryId));
      setOpenMenuId(null);
      setToast({
        tone: "success",
        message: `已刪除小項「${row.categoryName}」，上方已分配與剩餘可分配會同步回補。`,
      });
    } catch (error) {
      setToast({ tone: "error", message: `刪除小項失敗：${getErrorMessage(error)}` });
    } finally {
      setPendingKey(null);
    }
  }

  function addCategoryToGroup(group: CompactGroup) {
    openTextDialog({
      title: `新增「${group.groupName}」小項`,
      label: "小項名稱",
      confirmLabel: "新增小項",
      onConfirm: async (nextName) => {
        setPendingKey(`add-${group.groupId}`);
        try {
          const nextSortOrder =
            group.rows.reduce((max, row, index) => Math.max(max, (index + 1) * 10), 0) + 10;
          const row = await createCategoryWithBudget(supabase, monthId, group, nextName, nextSortOrder);
          setRows((current) => [...current, row]);
          setToast({ tone: "success", message: `已在「${group.groupName}」新增小項「${nextName}」。` });
        } catch (error) {
          setToast({ tone: "error", message: `新增小項失敗：${getErrorMessage(error)}` });
        } finally {
          setPendingKey(null);
        }
      },
    });
  }

  return { toggleQuickEntry, renameCategory, deleteCategory, addCategoryToGroup };
}
