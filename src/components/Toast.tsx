"use client";

import { cn } from "@/lib/utils";

type ToastProps = {
  message: string;
  tone: "success" | "error" | "info";
};

export function Toast({ message, tone }: ToastProps) {
  return (
    <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
      <div className="chrome-window p-[6px]">
        <div
          className={cn(
            "chrome-statusbar px-chrome-md py-chrome-sm font-chrome-heading text-chrome-sm font-bold uppercase tracking-chrome-wide",
            tone === "success" && "text-success-dark",
            tone === "error" && "text-danger-dark",
            tone === "info" && "text-chrome-900",
          )}
        >
          {message}
        </div>
      </div>
    </div>
  );
}
