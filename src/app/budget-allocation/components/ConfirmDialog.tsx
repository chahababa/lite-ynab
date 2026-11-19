"use client";

import { cn } from "@/lib/utils";

import type { ConfirmDialogState, SetState } from "../types";

type ConfirmDialogProps = {
  confirmDialog: ConfirmDialogState;
  setConfirmDialog: SetState<ConfirmDialogState | null>;
  submitConfirmDialog: () => Promise<void>;
};

export function ConfirmDialog({ confirmDialog, setConfirmDialog, submitConfirmDialog }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-scrim/40 px-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={confirmDialog.title} className="w-full max-w-md rounded-[28px] bg-surface p-5 shadow-elev-3">
        <h2 className="text-title-md text-on-surface">{confirmDialog.title}</h2>
        <div className="mt-2 text-body-md text-on-surface-variant">{confirmDialog.description}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmDialog(null)} className="h-10 rounded-full px-4 text-body-md font-medium text-primary hover:bg-primary/5 active:bg-primary/10">
            取消
          </button>
          <button
            type="button"
            onClick={() => void submitConfirmDialog()}
            className={cn(
              "h-10 rounded-full px-5 text-body-md font-medium transition-colors duration-m3-short",
              confirmDialog.tone === "danger"
                ? "bg-money-expense text-money-expense-container hover:bg-money-expense/90"
                : "bg-primary text-primary-on hover:bg-primary/90",
            )}
          >
            {confirmDialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
