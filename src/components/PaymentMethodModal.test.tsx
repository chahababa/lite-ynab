// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaymentMethodModal } from "@/components/PaymentMethodModal";
import type { PaymentMethodOption } from "@/lib/types";

const PMS: PaymentMethodOption[] = [
  { id: "pm-cash", name: "現金", sortOrder: 10 },
  { id: "pm-card", name: "信用卡 A", sortOrder: 20 },
];

describe("PaymentMethodModal", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <PaymentMethodModal
        open={false}
        paymentMethods={PMS}
        selectedId="pm-cash"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders payment methods when open and highlights selected", () => {
    render(
      <PaymentMethodModal
        open
        paymentMethods={PMS}
        selectedId="pm-card"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const cardButton = screen.getByRole("button", { name: "信用卡 A" });
    expect(cardButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "現金" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onSelect and onClose when a payment method is chosen", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <PaymentMethodModal
        open
        paymentMethods={PMS}
        selectedId="pm-cash"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "信用卡 A" }));
    expect(onSelect).toHaveBeenCalledWith("pm-card");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when overlay is clicked but not when card is clicked", () => {
    const onClose = vi.fn();
    render(
      <PaymentMethodModal
        open
        paymentMethods={PMS}
        selectedId="pm-cash"
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    // click on the dialog overlay (it's the container with onClick=onClose)
    const overlay = screen.getByRole("dialog");
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);

    // clicking the title text inside the card should NOT close
    fireEvent.click(screen.getByText("選擇支付方式"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape keydown and locks body scroll while open", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <PaymentMethodModal
        open
        paymentMethods={PMS}
        selectedId="pm-cash"
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <PaymentMethodModal
        open={false}
        paymentMethods={PMS}
        selectedId="pm-cash"
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(document.body.style.overflow).toBe("");
  });
});
