import { beforeEach, describe, expect, it, vi } from "vitest";

import BudgetAllocationCompactPage from "@/app/budget-allocation-compact/page";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("BudgetAllocationCompactPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects legacy compact route to the formal budget allocation page", () => {
    BudgetAllocationCompactPage();

    expect(redirectMock).toHaveBeenCalledWith("/budget-allocation");
  });
});
