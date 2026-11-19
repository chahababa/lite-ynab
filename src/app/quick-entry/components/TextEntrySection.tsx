"use client";

import { Sparkles } from "lucide-react";

import type { parseHermesTransactionText } from "@/lib/hermesTransaction";

type TextEntrySectionProps = {
  textEntry: string;
  setTextEntry: (value: string) => void;
  applyTextEntry: () => void;
  loading: boolean;
  parsedText: ReturnType<typeof parseHermesTransactionText> | null;
};

export function TextEntrySection({
  textEntry,
  setTextEntry,
  applyTextEntry,
  loading,
  parsedText,
}: TextEntrySectionProps) {
  return (
    <section className="rounded-md border border-outline bg-surface p-3 shadow-elev-1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1 text-title-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            文字記帳
          </p>
          <p className="text-label-sm text-on-surface-variant">例：早餐 80 現金 個人/飲食</p>
        </div>
        <button
          type="button"
          onClick={applyTextEntry}
          disabled={!textEntry.trim() || loading}
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-body-sm font-medium text-primary-on hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40"
        >
          解析
        </button>
      </div>
      <textarea
        value={textEntry}
        onChange={(event) => setTextEntry(event.target.value)}
        aria-label="文字記帳內容"
        placeholder="輸入 Telegram 風格記帳文字"
        rows={2}
        className="w-full rounded-xs border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
      />
      {parsedText ? (
        <div className="mt-2 rounded-sm bg-surface-container px-3 py-2 text-label-sm text-on-surface-variant">
          預覽：{parsedText.amount ? `$${parsedText.amount.toLocaleString("en-US")}` : "未辨識金額"} · {parsedText.categoryName ?? "未辨識分類"} · {parsedText.paymentMethodName ?? "未辨識支付方式"}
          {parsedText.warnings.length > 0 ? `｜${parsedText.warnings.join("、")}` : ""}
        </div>
      ) : null}
    </section>
  );
}
