"use client";

import { X } from "lucide-react";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="chrome-window w-full max-w-[280px] p-[6px]"
      >
        <div className="chrome-titlebar flex items-center justify-between gap-2 px-chrome-md py-chrome-sm">
          <p className="font-chrome-heading text-chrome-sm font-bold tracking-chrome-wider text-chrome-900">
            選擇支付方式
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="flex h-6 w-6 items-center justify-center rounded-chrome-btn border border-chrome-700 bg-chrome-100 text-chrome-900 hover:bg-chrome-50 active:bg-chrome-200"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <ul className="mt-chrome-sm max-h-[70vh] overflow-y-auto">
          {paymentMethods.length === 0 ? (
            <li className="px-chrome-md py-chrome-md text-chrome-sm text-chrome-700">
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
                      "flex w-full items-center justify-between rounded-chrome-btn border border-chrome-700 px-chrome-md py-chrome-sm font-chrome-body text-chrome-sm text-chrome-900 transition-colors duration-fast",
                      "hover:bg-chrome-50 active:bg-chrome-200",
                      isSelected ? "bg-chrome-200 font-bold" : "bg-chrome-100",
                      "mt-chrome-xs first:mt-0",
                    )}
                  >
                    <span>{pm.name}</span>
                    {isSelected ? (
                      <span aria-hidden className="font-chrome-mono text-chrome-xs">
                        ●
                      </span>
                    ) : null}
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
