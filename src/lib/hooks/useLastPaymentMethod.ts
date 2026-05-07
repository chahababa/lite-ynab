"use client";

import { useCallback, useEffect, useState } from "react";

import type { PaymentMethodOption } from "@/lib/types";

export const LAST_PAYMENT_METHOD_STORAGE_KEY = "lite-ynab.last-payment-method-id";

function readStoredId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_PAYMENT_METHOD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_PAYMENT_METHOD_STORAGE_KEY, id);
  } catch {
    // ignore quota / security errors; selection still works in-memory
  }
}

function pickInitialId(paymentMethods: PaymentMethodOption[]): string {
  const stored = readStoredId();
  if (stored && paymentMethods.some((pm) => pm.id === stored)) {
    return stored;
  }
  return paymentMethods[0]?.id ?? "";
}

export function useLastPaymentMethod(
  paymentMethods: PaymentMethodOption[],
): [string, (id: string) => void] {
  const [selectedId, setSelectedIdState] = useState<string>(() =>
    pickInitialId(paymentMethods),
  );

  useEffect(() => {
    if (selectedId && paymentMethods.some((pm) => pm.id === selectedId)) {
      return;
    }
    setSelectedIdState(pickInitialId(paymentMethods));
  }, [paymentMethods, selectedId]);

  const setSelectedId = useCallback((id: string) => {
    setSelectedIdState(id);
    writeStoredId(id);
  }, []);

  return [selectedId, setSelectedId];
}
