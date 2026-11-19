"use client";

import { MoneyText } from "@/components/m3/MoneyText";
import type { PaymentMethodOption } from "@/lib/types";

import { formatDateChipLabel } from "../helpers";
import type { EntryType } from "../types";

type AmountCardProps = {
  date: string;
  handleDateChipClick: () => void;
  paymentMethods: PaymentMethodOption[];
  selectedPaymentMethod: PaymentMethodOption | null;
  setIsPaymentModalOpen: (open: boolean) => void;
  amountValue: number;
  entryType: EntryType;
};

export function AmountCard({
  date,
  handleDateChipClick,
  paymentMethods,
  selectedPaymentMethod,
  setIsPaymentModalOpen,
  amountValue,
  entryType,
}: AmountCardProps) {
  return (
    <div className="flex items-baseline justify-between rounded-md bg-primary-container px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="text-label-sm uppercase text-primary-on-container/70">
          金額
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDateChipClick}
            aria-label={`日期 ${formatDateChipLabel(date)}`}
            className="text-label-md text-primary-on-container/70 hover:underline"
          >
            {formatDateChipLabel(date)}
          </button>
          <span className="text-label-md text-primary-on-container/40">·</span>
          <button
            type="button"
            onClick={() => {
              if (paymentMethods.length === 0) return;
              setIsPaymentModalOpen(true);
            }}
            disabled={paymentMethods.length === 0}
            aria-label={`支付方式 ${selectedPaymentMethod?.name ?? "未設定"}`}
            className="text-label-md text-primary-on-container/70 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            {selectedPaymentMethod?.name ?? "未設定"}
          </button>
        </div>
      </div>
      <MoneyText
        value={amountValue}
        type={entryType === "income" ? "income" : "expense"}
        size="display"
      />
    </div>
  );
}
