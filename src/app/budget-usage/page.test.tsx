// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BudgetUsagePage from "@/app/budget-usage/page";

const { fetchBudgetUsageData, routerValue } = vi.hoisted(() => ({
  fetchBudgetUsageData: vi.fn(),
  routerValue: { replace: vi.fn() },
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
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

describe("BudgetUsagePage (M3 v2.0)", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    fetchBudgetUsageData.mockResolvedValue({
      monthId: "2026-04",
      scope: "month",
      summary: { spent: 18200, remaining: 11800, overspentCount: 1 },
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
            {
              id: "cat-coffee",
              groupId: "group-personal",
              groupName: "個人",
              name: "咖啡",
              allocated: 2000,
              spent: 2500,
              remaining: -500,
              usageRate: 1.25,
              isOverspent: true,
            },
          ],
        },
      ],
    });
  });

  it("renders M3 dashboard with summary cards and category list", async () => {
    render(createElement(BudgetUsagePage));

    expect(await screen.findByText("預算使用")).toBeInTheDocument();
    // scope chips
    expect(screen.getByRole("button", { name: "本月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今天" })).toBeInTheDocument();
    // summary cards
    expect(screen.getByText("總預算")).toBeInTheDocument();
    expect(screen.getByText("本月已支出")).toBeInTheDocument();
    expect(screen.getByText("剩餘")).toBeInTheDocument();
    expect(screen.getByText("超支類別")).toBeInTheDocument();
    // category list
    expect(screen.getByText("飲食")).toBeInTheDocument();
    expect(screen.getByText("咖啡")).toBeInTheDocument();
  });

  it("shows overspent banner when overspentCount > 0", async () => {
    render(createElement(BudgetUsagePage));
    expect(await screen.findByText(/1 個類別超支/)).toBeInTheDocument();
  });

  it("sorts categories by usageRate desc (overspent first)", async () => {
    render(createElement(BudgetUsagePage));
    await screen.findByText("飲食");
    const itemNames = screen.getAllByText(/^(飲食|咖啡)$/);
    // 咖啡 (usageRate 1.25, overspent) should come before 飲食 (0.7)
    expect(itemNames[0].textContent).toBe("咖啡");
    expect(itemNames[1].textContent).toBe("飲食");
  });

  it("toggles scope between 本月 / 今天", async () => {
    render(createElement(BudgetUsagePage));
    await waitFor(() => {
      expect(screen.queryByText("本月已支出")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "今天" }));
    await waitFor(() => {
      expect(screen.queryByText("今日已支出")).toBeInTheDocument();
    });
  });
});
