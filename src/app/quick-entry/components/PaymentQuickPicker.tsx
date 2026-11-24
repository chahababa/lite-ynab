"use client";

import type { PaymentMethodOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type PaymentQuickPickerProps = {
  visiblePaymentMethods: PaymentMethodOption[];
  hasMore: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenMore: () => void;
};

/** 最常用的支付方式直接攤開成大按鈕，其餘收進「更多」。 */
export function PaymentQuickPicker({
  visiblePaymentMethods,
  hasMore,
  selectedId,
  onSelect,
  onOpenMore,
}: PaymentQuickPickerProps) {
  if (visiblePaymentMethods.length === 0) return null;

  return (
    <div className="flex gap-2" role="group" aria-label="支付方式">
      {visiblePaymentMethods.map((pm) => {
        const isSelected = pm.id === selectedId;
        return (
          <button
            key={pm.id}
            type="button"
            onClick={() => onSelect(pm.id)}
            aria-label={`支付方式 ${pm.name}`}
            aria-pressed={isSelected}
            className={cn(
              "h-10 min-w-0 flex-1 truncate rounded-full px-4 text-body-md transition-colors duration-m3-short",
              isSelected
                ? "bg-primary-container font-medium text-primary-on-container"
                : "border border-outline text-on-surface-variant hover:bg-on-surface/5 active:bg-on-surface/10",
            )}
          >
            {pm.name}
          </button>
        );
      })}
      {hasMore ? (
        <button
          type="button"
          onClick={() => onOpenMore()}
          aria-label="更多支付方式"
          className="h-10 shrink-0 rounded-full border border-outline-variant px-4 text-body-md text-on-surface-variant hover:bg-on-surface/5 active:bg-on-surface/10"
        >
          更多
        </button>
      ) : null}
    </div>
  );
}
