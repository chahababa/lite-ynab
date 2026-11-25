"use client";

import type { SpendingReminder } from "@/lib/dailyAllowance";
import { cn } from "@/lib/utils";

import type { LastSavedTransaction } from "../types";

type LastSavedNoticeProps = {
  lastSaved: LastSavedTransaction;
  /** 這個分類記完之後的提醒（今天還能花多少／已超過多少）；沒有預算時為 null。 */
  reminder: SpendingReminder | null;
  isUndoing: boolean;
  onUndo: () => void;
};

export function LastSavedNotice({ lastSaved, reminder, isUndoing, onUndo }: LastSavedNoticeProps) {
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-md border border-primary bg-primary-container px-4 py-2 text-body-sm text-primary-on-container"
    >
      <div className="min-w-0">
        <p>
          已儲存 {lastSaved.categoryName} ${lastSaved.amount.toLocaleString("en-US")}（{lastSaved.paymentMethodName}）
        </p>
        {reminder ? (
          <p className={cn("mt-0.5 font-medium", reminder.isWarning ? "text-money-warn" : null)}>{reminder.text}</p>
        ) : null}
      </div>
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
