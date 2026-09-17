// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Toast } from "@/components/Toast";

describe("Toast", () => {
  it("uses a high-contrast semantic foreground for success messages", () => {
    render(<Toast message="報表 CSV 已匯出" tone="success" />);

    expect(screen.getByRole("status")).toHaveClass(
      "bg-money-income-container",
      "text-on-surface",
    );
    expect(screen.getByText("報表 CSV 已匯出")).toBeInTheDocument();
  });
});
