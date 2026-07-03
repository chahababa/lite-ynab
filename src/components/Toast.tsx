"use client";

import { cn } from "@/lib/utils";

type ToastProps = {
  message: string;
  tone: "success" | "error" | "info";
  action?: {
    label: string;
    onClick: () => void;
  };
};

export function Toast({ message, tone, action }: ToastProps) {
  return (
    <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center rounded-md px-4 py-3 shadow-elev-2 font-sans text-body-md font-medium",
          action ? "justify-between gap-3" : "justify-center",
          tone === "success" && "bg-money-income-container text-money-income",
          tone === "error" && "bg-money-expense-container text-money-expense",
          tone === "info" && "bg-surface text-on-surface border border-outline",
        )}
      >
        <span className="min-w-0">{message}</span>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 rounded-full px-3 py-1 font-medium underline underline-offset-2 hover:bg-on-surface/5 active:bg-on-surface/10"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
