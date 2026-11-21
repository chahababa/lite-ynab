"use client";

import type { PaymentMethodOption } from "@/lib/types";

import type { SetState } from "../types";

type PaymentMethodManagerProps = {
  paymentMethods: PaymentMethodOption[];
  pendingKey: string | null;
  newPaymentMethodName: string;
  setNewPaymentMethodName: SetState<string>;
  addPaymentMethod: () => Promise<void>;
  renamePaymentMethod: (method: PaymentMethodOption) => void;
  deletePaymentMethod: (method: PaymentMethodOption, confirmed?: boolean) => Promise<void>;
};

export function PaymentMethodManager({
  paymentMethods,
  pendingKey,
  newPaymentMethodName,
  setNewPaymentMethodName,
  addPaymentMethod,
  renamePaymentMethod,
  deletePaymentMethod,
}: PaymentMethodManagerProps) {
  return (
    <section className="rounded-md border border-outline bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-outline px-4 py-3">
        <h2 className="text-title-md">支付方式管理</h2>
        <p className="text-body-sm text-on-surface-variant">
          {paymentMethods.length} 個
        </p>
      </div>

      <div className="space-y-2 p-3">
        {paymentMethods.map((method) => (
          <div
            key={method.id}
            className="flex items-center justify-between gap-3 rounded-sm bg-surface-container-low px-3 py-2"
          >
            <p className="text-body-md font-medium text-on-surface">
              {method.name}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-full px-3 text-body-sm text-primary hover:bg-primary/5 active:bg-primary/10 disabled:opacity-40"
                onClick={() => void renamePaymentMethod(method)}
                disabled={pendingKey === `payment-rename-${method.id}`}
              >
                重新命名
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-full px-3 text-body-sm text-money-expense hover:bg-money-expense/5 active:bg-money-expense/10 disabled:opacity-40"
                onClick={() => void deletePaymentMethod(method)}
                disabled={pendingKey === `payment-delete-${method.id}`}
              >
                刪除
              </button>
            </div>
          </div>
        ))}

        <div className="flex items-end gap-2 rounded-sm bg-surface-container-low px-3 py-2">
          <label className="flex-1">
            <span className="mb-1 block text-label-md text-on-surface-variant">
              新增支付方式
            </span>
            <input
              value={newPaymentMethodName}
              onChange={(event) => setNewPaymentMethodName(event.target.value)}
              className="h-10 w-full rounded-xs border border-outline-variant bg-surface px-3 text-body-md text-on-surface outline-none focus:border-primary focus:border-2 focus:px-[11px]"
              placeholder="例如：現金、信用卡 A"
            />
          </label>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-body-md font-medium text-primary-on transition-colors duration-m3-short hover:bg-primary/90 active:bg-primary/80 disabled:opacity-40"
            onClick={() => void addPaymentMethod()}
            disabled={pendingKey === "payment-add"}
          >
            {pendingKey === "payment-add" ? "新增中" : "新增"}
          </button>
        </div>
      </div>
    </section>
  );
}
