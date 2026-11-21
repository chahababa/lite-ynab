"use client";

import { MoneyText } from "@/components/m3/MoneyText";

import { formatDateChipLabel } from "../helpers";

type AmountCardProps = {
  date: string;
  handleDateChipClick: () => void;
  amountValue: number;
};

export function AmountCard({ date, handleDateChipClick, amountValue }: AmountCardProps) {
  return (
    <div className="flex items-baseline justify-between rounded-md bg-primary-container px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="text-label-sm text-primary-on-container/70">金額</span>
        <button
          type="button"
          onClick={handleDateChipClick}
          aria-label={`日期 ${formatDateChipLabel(date)}`}
          className="self-start text-label-md text-primary-on-container/70 underline decoration-dotted underline-offset-4 hover:text-primary-on-container"
        >
          {formatDateChipLabel(date)}
        </button>
      </div>
      <MoneyText value={amountValue} type="expense" size="display" />
    </div>
  );
}
