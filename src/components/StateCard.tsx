"use client";

import type { ReactNode } from "react";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

type StateCardProps = {
  title: string;
  description: string;
  tone?: "neutral" | "error";
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
};

export function StateCard({
  title,
  description,
  tone = "neutral",
  actionLabel,
  onAction,
  icon,
}: StateCardProps) {
  const resolvedIcon =
    icon ??
    (tone === "error" ? (
      <AlertCircle className="h-4 w-4" />
    ) : (
      <Inbox className="h-4 w-4" />
    ));

  return (
    <div
      className={cn(
        "rounded-md border bg-surface p-4",
        tone === "error" ? "border-money-expense" : "border-outline",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            tone === "error"
              ? "bg-money-expense-container text-money-expense"
              : "bg-primary-container text-primary-on-container",
          )}
        >
          {resolvedIcon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-title-md text-on-surface">{title}</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">{description}</p>
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className={cn(
                "mt-3 inline-flex h-9 items-center gap-2 rounded-full border px-4 text-body-sm font-medium transition-colors duration-m3-short",
                tone === "error"
                  ? "border-money-expense text-money-expense hover:bg-money-expense/5 active:bg-money-expense/10"
                  : "border-outline-variant text-primary hover:bg-primary/5 active:bg-primary/10",
              )}
            >
              <RefreshCw className="h-4 w-4" />
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
