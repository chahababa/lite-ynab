"use client";

import type { SetState, TextDialogState } from "../types";

type TextInputDialogProps = {
  textDialog: TextDialogState;
  setTextDialog: SetState<TextDialogState | null>;
  textDialogValue: string;
  setTextDialogValue: SetState<string>;
  submitTextDialog: () => Promise<void>;
};

export function TextInputDialog({
  textDialog,
  setTextDialog,
  textDialogValue,
  setTextDialogValue,
  submitTextDialog,
}: TextInputDialogProps) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-scrim/40 px-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={textDialog.title} className="w-full max-w-md rounded-[28px] bg-surface p-5 shadow-elev-3">
        <h2 className="text-title-md text-on-surface">{textDialog.title}</h2>
        <label className="mt-4 block">
          <span className="mb-1 block text-label-md text-on-surface-variant">{textDialog.label}</span>
          <input
            value={textDialogValue}
            onChange={(event) => setTextDialogValue(event.target.value)}
            className="h-11 w-full rounded-xs border border-outline-variant bg-surface px-3 text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setTextDialog(null)} className="h-10 rounded-full px-4 text-body-md font-medium text-primary hover:bg-primary/5 active:bg-primary/10">
            取消
          </button>
          <button type="button" onClick={() => void submitTextDialog()} disabled={!textDialogValue.trim()} className="h-10 rounded-full bg-primary px-5 text-body-md font-medium text-primary-on hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40">
            {textDialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
