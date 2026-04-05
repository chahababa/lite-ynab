// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BudgetUsagePage from "@/app/budget-usage/page";

const { fetchBudgetUsageData, routerValue } = vi.hoisted(() => ({
  fetchBudgetUsageData: vi.fn(),
  routerValue: {
    replace: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerValue,
}));

vi.mock("@/lib/data", () => ({
  fetchBudgetUsageData,
}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      }),
    },
  }),
}));

describe("BudgetUsagePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBudgetUsageData.mockResolvedValue({
      user: { email: "demo@example.com" },
      monthId: "2026-04",
      scope: "month",
      summary: {
        spent: 18200,
        remaining: 11800,
        overspentCount: 1,
      },
      groups: [
        {
          id: "group-personal",
          name: "個人",
          allocated: 10000,
          spent: 6200,
          remaining: 3800,
          hasOverspentItem: false,
          categories: [
            {
              id: "cat-food",
              groupId: "group-personal",
              groupName: "個人",
              name: "飲食",
              allocated: 6000,
              spent: 4200,
              remaining: 1800,
              usageRate: 0.7,
              isOverspent: false,
            },
          ],
        },
      ],
    });
  });

  it("renders dashboard layout with usage toggles and large spent/remaining cards", async () => {
    render(createElement(BudgetUsagePage));

    expect(await screen.findByText("預算使用儀表板")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今天" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本月" })).toBeInTheDocument();
    expect(screen.getByText("本月已支出")).toBeInTheDocument();
    expect(screen.getAllByText("剩餘可用").length).toBeGreaterThan(0);
    expect(screen.getByText("超支項目")).toBeInTheDocument();
    expect(screen.getByText("個人")).toBeInTheDocument();
    expect(screen.getByText("飲食")).toBeInTheDocument();
    expect(screen.getByText("本月預算 $6,000")).toBeInTheDocument();
    expect(screen.getAllByText("剩餘可用").length).toBeGreaterThan(0);
  });
});
