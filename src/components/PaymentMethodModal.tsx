"use client";

import { Check, X } from "lucide-react";

import { useModalLifecycle } from "@/lib/hooks/useModalLifecycle";
import type { PaymentMethodOption } from "@/lib/types";
import { cn } from "@/lib/utils";

type PaymentMethodModalProps = {
  open: boolean;
  paymentMethods: PaymentMethodOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function PaymentMethodModal({
  open,
  paymentMethods,
  selectedId,
  onSelect,
  onClose,
}: PaymentMethodModalProps) {
  useModalLifecycle({ open, onClose, historyKey: "payment-method" });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="選擇支付方式"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[320px] rounded-md bg-surface shadow-elev-3"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <p className="text-title-md text-on-surface">選擇支付方式</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto px-2 pb-4">
          {paymentMethods.length === 0 ? (
            <li className="px-3 py-3 text-body-md text-on-surface-variant">
              尚未建立任何支付方式
            </li>
          ) : (
            paymentMethods.map((pm) => {
              const isSelected = pm.id === selectedId;
              return (
                <li key={pm.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(pm.id);
                      onClose();
                    }}
                    aria-label={pm.name}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-3 py-3 text-left text-body-md transition-colors duration-m3-short",
                      "hover:bg-on-surface/5 active:bg-on-surface/10",
                      isSelected
                        ? "bg-primary-container text-primary-on-container font-medium"
                        : "text-on-surface",
                    )}
                  >
                    <span>{pm.name}</span>
                    {isSelected ? <Check className="h-4 w-4" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
