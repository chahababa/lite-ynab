"use client";

import Link from "next/link";
import { Settings as SettingsIcon, X } from "lucide-react";

type QuickEntryTopBarProps = {
  onClose: () => void;
};

export function QuickEntryTopBar({ onClose }: QuickEntryTopBarProps) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => onClose()}
        aria-label="關閉"
        className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
      >
        <X className="h-5 w-5" />
      </button>
      <p className="text-title-md">記一筆</p>
      <Link
        href="/settings"
        aria-label="設定"
        className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
      >
        <SettingsIcon className="h-5 w-5" />
      </Link>
    </div>
  );
}
