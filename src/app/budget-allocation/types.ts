import type { Dispatch, ReactNode, SetStateAction } from "react";

import type { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { BudgetRow, ToastState } from "@/lib/types";

export type CompactGroup = {
  groupId: string;
  groupName: string;
  rows: BudgetRow[];
};

export type PreviousReference = {
  allocated: number;
  spent: number;
};

export type ConfirmDialogState = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<void> | void;
};

export type TextDialogState = {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  onConfirm: (value: string) => Promise<void> | void;
};

export type SupabaseBrowserClient = ReturnType<typeof getSupabaseBrowserClient>;
export type SetState<T> = Dispatch<SetStateAction<T>>;
export type SetToast = SetState<ToastState>;
export type SetPendingKey = SetState<string | null>;

/** Props shared by every category (小項) row; passed through BudgetGroupSection. */
export type CategoryRowHandlers = {
  openMenuId: string | null;
  setOpenMenuId: SetState<string | null>;
  setRows: SetState<BudgetRow[]>;
  toggleQuickEntry: (row: BudgetRow) => Promise<void>;
  renameCategory: (row: BudgetRow) => void;
  deleteCategory: (row: BudgetRow, confirmed?: boolean) => Promise<void>;
  scheduleAutoBudgetSave: (categoryId: string, categoryName: string, autoAmount: number) => void;
  scheduleBudgetSave: (row: BudgetRow, allocated: number) => void;
};

/** Props shared by every category group (大項) settings menu; passed through BudgetGroupSection. */
export type GroupMenuHandlers = {
  openGroupMenuId: string | null;
  setOpenGroupMenuId: SetState<string | null>;
  reorderGroups: (groupId: string, direction: -1 | 1) => Promise<void>;
  renameGroup: (group: CompactGroup) => void;
  addCategoryToGroup: (group: CompactGroup) => void;
  deleteGroup: (group: CompactGroup, confirmed?: boolean) => Promise<void>;
};
