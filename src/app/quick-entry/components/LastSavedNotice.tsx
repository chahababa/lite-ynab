"use client";

import type { LastSavedTransaction } from "../types";

type LastSavedNoticeProps = {
  lastSaved: LastSavedTransaction;
  isUndoing: boolean;
  onUndo: () => void;
};

export function LastSavedNotice({ lastSaved, isUndoing, onUndo }: LastSavedNoticeProps) {
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-md border border-primary bg-primary-container px-4 py-2 text-body-sm text-primary-on-container"
    >
      <p>
        已儲存 {lastSaved.categoryName} ${lastSaved.amount.toLocaleString("en-US")}（{lastSaved.paymentMethodName}）
      </p>
      {lastSaved.id ? (
        <button
          type="button"
          onClick={() => onUndo()}
          disabled={isUndoing}
          className="shrink-0 rounded-full px-3 py-1 font-medium underline hover:bg-on-surface/5 active:bg-on-surface/10 disabled:opacity-40 disabled:no-underline"
        >
          {isUndoing ? "復原中..." : "復原"}
        </button>
      ) : null}
    </div>
  );
}
