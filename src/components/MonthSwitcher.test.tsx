// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonthSwitcher } from "@/components/MonthSwitcher";

describe("MonthSwitcher", () => {
  it("keeps both named controls at least 44 by 44 pixels", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    render(
      <MonthSwitcher
        monthId="2026-09"
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    );

    const previous = screen.getByRole("button", { name: "上一個月" });
    const next = screen.getByRole("button", { name: "下一個月" });

    expect(previous).toHaveClass("h-11", "w-11");
    expect(next).toHaveClass("h-11", "w-11");

    fireEvent.click(previous);
    fireEvent.click(next);
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
