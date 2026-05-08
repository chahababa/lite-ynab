"use client";

import { cn } from "@/lib/utils";

type ToastProps = {
  message: string;
  tone: "success" | "error" | "info";
};

export function Toast({ message, tone }: ToastProps) {
  return (
    <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center justify-center rounded-md px-4 py-3 shadow-elev-2 font-sans text-body-md font-medium",
          tone === "success" && "bg-money-income-container text-money-income",
          tone === "error" && "bg-money-expense-container text-money-expense",
          tone === "info" && "bg-surface text-on-surface border border-outline",
        )}
      >
        {message}
      </div>
    </div>
  );
}
