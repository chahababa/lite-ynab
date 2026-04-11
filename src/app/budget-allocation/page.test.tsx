// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BudgetAllocationPage from "@/app/budget-allocation/page";

const { fetchBudgetAllocationData, fetchBudgetReferenceData, routerValue } = vi.hoisted(() => ({
  fetchBudgetAllocationData: vi.fn(),
  fetchBudgetReferenceData: vi.fn(),
  routerValue: {
    replace: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerValue,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/lib/data", () => ({
  fetchBudgetAllocationData,
  fetchBudgetReferenceData,
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
    from: () => ({
      upsert: () => Promise.resolve({ error: null }),
      insert: () => Promise.resolve({ error: null }),
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  }),
}));

describe("BudgetAllocationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchBudgetAllocationData.mockResolvedValue({
      user: { email: "demo@example.com" },
      groups: [
        {
          id: "group-personal",
          user_id: "user-1",
          name: "個人",
          sort_order: 10,
        },
      ],
      categoryOptions: [
        {
          id: "cat-food",
          groupId: "group-personal",
          groupName: "個人",
          name: "飲食",
          isQuick: true,
          isAuto: true,
          autoAmount: 1200,
          sortOrder: 10,
        },
      ],
      paymentMethods: [
        {
          id: "payment-cash",
          name: "現金",
          sortOrder: 10,
        },
      ],
      recentTransactions: [],
      quickCategories: [],
      income: {
        id: "income-1",
        user_id: "user-1",
        month_id: "2026-04",
        amount: 5000,
      },
      budgetRows: [
        {
          budgetId: "budget-food",
          categoryId: "cat-food",
          categoryGroupId: "group-personal",
          categoryGroupName: "個人",
          categoryName: "飲食",
          allocated: 1200,
          spent: 300,
          remaining: 900,
          isQuick: true,
          isAuto: true,
          autoAmount: 1200,
          warning: null,
        },
      ],
      unallocated: 3800,
    });
    fetchBudgetReferenceData.mockResolvedValue([
      {
        categoryId: "cat-food",
        allocated: 1000,
        spent: 250,
      },
    ]);
  });

  it("renders summary and monthly planning actions", async () => {
    render(createElement(BudgetAllocationPage));

    expect(await screen.findByText("預算分配中心")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "複製上月預算" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批次套用固定預算" })).toBeInTheDocument();
    expect(screen.getByText("飲食")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("1200").length).toBeGreaterThan(0);
  });

  it("renders category and payment management sections", async () => {
    render(createElement(BudgetAllocationPage));

    expect(await screen.findByText("支付方式管理")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "個人 設定" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "飲食 設定" }).length).toBeGreaterThan(0);
  });
});
