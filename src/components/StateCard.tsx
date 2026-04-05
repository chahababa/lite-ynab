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
    icon ?? (tone === "error" ? <AlertCircle className="h-4 w-4" /> : <Inbox className="h-4 w-4" />);

  return (
    <div className="chrome-window p-[6px]">
      <div className="chrome-led-panel px-chrome-md py-chrome-lg">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "chrome-btn flex h-10 w-10 items-center justify-center",
              tone === "error" ? "chrome-btn--danger" : "",
            )}
          >
            {resolvedIcon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="chrome-led-label text-chrome-sm uppercase">{title}</p>
            <p className="mt-2 text-sm leading-6 text-chrome-300">{description}</p>
            {actionLabel && onAction ? (
              <button
                type="button"
                onClick={onAction}
                className={cn(
                  "chrome-btn mt-4 inline-flex items-center gap-2 px-chrome-md py-chrome-sm font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide",
                  tone === "error" && "chrome-btn--danger",
                )}
              >
                <RefreshCw className="h-4 w-4" />
                {actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
