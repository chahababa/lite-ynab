"use client";

import { cn } from "@/lib/utils";

type ToastProps = {
  message: string;
  tone: "success" | "error" | "info";
};

export function Toast({ message, tone }: ToastProps) {
  return (
    <div
      className={cn(
        "fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-float",
        tone === "success" && "bg-mint",
        tone === "error" && "bg-coral",
        tone === "info" && "bg-ink",
      )}
    >
      {message}
    </div>
  );
}
