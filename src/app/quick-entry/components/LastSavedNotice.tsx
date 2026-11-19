"use client";

import Link from "next/link";

import type { LastSavedTransaction } from "../types";

type LastSavedNoticeProps = {
  lastSaved: LastSavedTransaction;
};

export function LastSavedNotice({ lastSaved }: LastSavedNoticeProps) {
  return (
    <div className="rounded-md border border-primary bg-primary-container px-4 py-3 text-body-sm text-primary-on-container">
      <div className="flex items-start justify-between gap-3">
        <p>
          已儲存 {lastSaved.categoryName} ${lastSaved.amount.toLocaleString("en-US")}（{lastSaved.paymentMethodName}）
        </p>
        <Link href="/transactions" className="shrink-0 font-medium underline">
          編輯 / 復原
        </Link>
      </div>
      <p className="mt-1 text-label-sm opacity-75">為避免誤刪，復原走交易列表確認流程；本頁已保留最近範本可快速重記。</p>
    </div>
  );
}
