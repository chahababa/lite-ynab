// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MonthPage from "@/app/month/page";
import { buildMonthView } from "@/app/month/helpers";
import type { BudgetUsageData, BudgetUsageItem } from "@/lib/types";

const { fetchBudgetUsageData, routerValue } = vi.hoisted(() => ({
  fetchBudgetUsageData: vi.fn(),
  routerValue: { replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerValue,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/CtbcInboxShortcut", () => ({
  CtbcInboxShortcut: () => null,
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

function item(overrides: Partial<BudgetUsageItem> & { id: string; name: string }): BudgetUsageItem {
  const allocated = overrides.allocated ?? 0;
  const carryover = overrides.carryover ?? 0;
  const spent = overrides.spent ?? 0;
  const available = allocated + carryover;
  return {
    groupId: "group-personal",
    groupName: "個人",
    allocated,
    carryover,
    spent,
    remaining: available - spent,
    usageRate: available > 0 ? spent / available : spent > 0 ? 1 : 0,
    isOverspent: spent > available,
    ...overrides,
  };
}

function makeData(monthId: string, categories: BudgetUsageItem[]): BudgetUsageData {
  return {
    monthId,
    scope: "month",
    summary: { spent: 0, remaining: 0, overspentCount: 0 },
    groups: [
      {
        id: "group-personal",
        name: "個人",
        allocated: 0,
        carryover: 0,
        spent: 0,
        remaining: 0,
        hasOverspentItem: false,
        categories,
      },
    ],
  };
}

const CATEGORIES = [
  item({ id: "cat-food", name: "飲食", allocated: 6000, spent: 4200 }),
  item({ id: "cat-coffee", name: "咖啡", allocated: 2000, spent: 2500 }),
  item({ id: "cat-fun", name: "娛樂", allocated: 1000, carryover: 500, spent: 0 }),
  item({ id: "cat-unused", name: "保險", allocated: 0, spent: 0 }),
  item({ id: "cat-nobudget", name: "雜支", allocated: 0, spent: 300 }),
];

describe("buildMonthView", () => {
  it("adds up budget (with carryover) and spending, hiding categories with neither", () => {
    const view = buildMonthView(makeData("2026-11", CATEGORIES), "2026-11-21");

    expect(view.available).toBe(9500);
    expect(view.spent).toBe(7000);
    expect(view.remaining).toBe(2500);
    expect(view.percent).toBe(74);
    expect(view.items.map((entry) => entry.name)).not.toContain("保險");
  });

  it("puts overspent categories first, then the most used", () => {
    const view = buildMonthView(makeData("2026-11", CATEGORIES), "2026-11-21");

    expect(view.items.map((entry) => entry.name)).toEqual(["咖啡", "雜支", "飲食", "娛樂"]);
  });

  it("gives a daily allowance for the current month, counting today", () => {
    const view = buildMonthView(makeData("2026-11", CATEGORIES), "2026-11-21");

    expect(view.daysLeft).toBe(10);
    expect(view.dailyAllowance).toBe(250);
  });

  it("gives no daily allowance for other months or when overspent", () => {
    const past = buildMonthView(makeData("2026-10", CATEGORIES), "2026-11-21");
    expect(past.daysLeft).toBeNull();
    expect(past.dailyAllowance).toBeNull();

    const overspent = buildMonthView(
      makeData("2026-11", [item({ id: "cat-food", name: "飲食", allocated: 1000, spent: 1500 })]),
      "2026-11-21",
    );
    expect(overspent.remaining).toBe(-500);
    expect(overspent.percent).toBe(100);
    expect(overspent.dailyAllowance).toBeNull();
  });
});

describe("MonthPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    fetchBudgetUsageData.mockImplementation(async (_supabase: unknown, monthId: string) =>
      makeData(monthId, CATEGORIES),
    );
  });

  it("shows how much is left and each category's remaining amount", async () => {
    render(createElement(MonthPage));

    expect(await screen.findByText("還能花")).toBeInTheDocument();
    expect(screen.getByText("$2,500")).toBeInTheDocument();
    expect(screen.getByText("已花 $7,000 / 預算 $9,500")).toBeInTheDocument();
    expect(screen.getByText("剩 $1,800")).toBeInTheDocument();
    expect(screen.getByText("超 $500")).toBeInTheDocument();
    expect(screen.queryByText("保險")).not.toBeInTheDocument();
  });

  it("links to budget setup and settings", async () => {
    render(createElement(MonthPage));

    const adjust = await screen.findByText("調整預算");
    expect(adjust.closest("a")?.getAttribute("href")).toBe("/budget-allocation");
    expect(screen.getByLabelText("設定").getAttribute("href")).toBe("/settings");
  });

  it("loads another month when switching", async () => {
    render(createElement(MonthPage));
    await screen.findByText("還能花");
    const firstMonth = fetchBudgetUsageData.mock.calls[0][1] as string;

    fireEvent.click(screen.getByLabelText("上個月"));

    await waitFor(() => {
      const lastCall = fetchBudgetUsageData.mock.calls.at(-1);
      expect(lastCall?.[1]).not.toBe(firstMonth);
    });
  });

  it("shows a retry card when loading fails", async () => {
    fetchBudgetUsageData.mockRejectedValueOnce(new Error("網路中斷"));
    render(createElement(MonthPage));

    expect(await screen.findByText("載入失敗")).toBeInTheDocument();
    expect(screen.getByText(/網路中斷/)).toBeInTheDocument();
  });

  it("sends the user to login when not signed in", async () => {
    fetchBudgetUsageData.mockRejectedValueOnce(new Error("AUTH_REQUIRED"));
    render(createElement(MonthPage));

    await waitFor(() => expect(routerValue.replace).toHaveBeenCalledWith("/login"));
  });
});
