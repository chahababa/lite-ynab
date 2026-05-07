// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LAST_PAYMENT_METHOD_STORAGE_KEY,
  useLastPaymentMethod,
} from "@/lib/hooks/useLastPaymentMethod";
import type { PaymentMethodOption } from "@/lib/types";

const PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "pm-cash", name: "現金", sortOrder: 1 },
  { id: "pm-citi", name: "中信卡", sortOrder: 2 },
  { id: "pm-line", name: "LINE Pay", sortOrder: 3 },
];

describe("useLastPaymentMethod", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("falls back to the first payment method when localStorage is empty", () => {
    const { result } = renderHook(() => useLastPaymentMethod(PAYMENT_METHODS));

    expect(result.current[0]).toBe("pm-cash");
  });

  it("uses the stored id when it matches an available payment method", () => {
    window.localStorage.setItem(LAST_PAYMENT_METHOD_STORAGE_KEY, "pm-citi");

    const { result } = renderHook(() => useLastPaymentMethod(PAYMENT_METHODS));

    expect(result.current[0]).toBe("pm-citi");
  });

  it("falls back to the first payment method when stored id is no longer valid", () => {
    window.localStorage.setItem(LAST_PAYMENT_METHOD_STORAGE_KEY, "pm-deleted");

    const { result } = renderHook(() => useLastPaymentMethod(PAYMENT_METHODS));

    expect(result.current[0]).toBe("pm-cash");
  });

  it("writes selected id back to localStorage", () => {
    const { result } = renderHook(() => useLastPaymentMethod(PAYMENT_METHODS));

    act(() => {
      result.current[1]("pm-line");
    });

    expect(result.current[0]).toBe("pm-line");
    expect(window.localStorage.getItem(LAST_PAYMENT_METHOD_STORAGE_KEY)).toBe(
      "pm-line",
    );
  });

  it("returns empty string when no payment methods are available", () => {
    const { result } = renderHook(() => useLastPaymentMethod([]));

    expect(result.current[0]).toBe("");
  });
});
