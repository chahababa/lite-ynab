// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BudgetAllocationWizardPage from "@/app/budget-allocation/wizard/page";

const { fetchBudgetAllocationData, fetchBudgetReferenceData, routerValue } = vi.hoisted(() => ({
  fetchBudgetAllocationData: vi.fn(),
  fetchBudgetReferenceData: vi.fn(),
  routerValue: {
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerValue,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/lib/data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/data")>();
  return {
    ...original,
    fetchBudgetAllocationData,
    fetchBudgetReferenceData,
  };
});

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({
    from: () => ({
      upsert: () => Promise.resolve({ error: null }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  }),
}));

function createRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    budgetId: "budget-food",
    categoryId: "cat-food",
    categoryGroupId: "group-personal",
    categoryGroupName: "個人",
    categoryName: "飲食",
    allocated: 0,
    carryover: 0,
    spent: 0,
    remaining: 0,
    isQuick: true,
    isAuto: false,
    autoAmount: 0,
    warning: null,
    ...overrides,
  };
}

describe("BudgetAllocationWizardPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchBudgetAllocationData.mockResolvedValue({
      user: { email: "demo@example.com" },
      groups: [],
      categoryOptions: [],
      paymentMethods: [],
      income: { id: "income-1", user_id: "user-1", month_id: "2026-07", amount: 100000 },
      budgetRows: [
        createRow(),
        createRow({
          budgetId: "budget-rent",
          categoryId: "cat-rent",
          categoryGroupId: "group-home",
          categoryGroupName: "家庭",
          categoryName: "房租",
          isAuto: true,
          autoAmount: 36000,
        }),
      ],
      recentTransactions: [],
      quickCategories: [],
      unallocated: 100000,
    });
    fetchBudgetReferenceData.mockResolvedValue([
      { categoryId: "cat-food", allocated: 6000, spent: 5400 },
    ]);
  });

  it("starts with income confirmation and a sticky unallocated summary", async () => {
    render(createElement(BudgetAllocationWizardPage));

    expect(await screen.findByText("先確認本月收入")).toBeInTheDocument();
    expect(screen.getByText("待分配")).toBeInTheDocument();
    expect(screen.getByLabelText("本月收入金額")).toHaveValue("100000");
    expect(screen.getByText("步驟 1：確認收入")).toBeInTheDocument();
  });

  it("walks through groups and fills values with the previous-month shortcut", async () => {
    render(createElement(BudgetAllocationWizardPage));
    await screen.findByText("先確認本月收入");

    fireEvent.click(screen.getByRole("button", { name: /開始分配/ }));

    expect(await screen.findByText("個人")).toBeInTheDocument();
    expect(screen.getByText("上月 $6,000・花 $5,400")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "照上月 $6,000" }));
    expect(screen.getByLabelText("個人 飲食 本月預算")).toHaveValue("6000");

    fireEvent.click(screen.getByRole("button", { name: /下一組/ }));

    expect(await screen.findByText("家庭")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "照固定 $36,000" }));
    expect(screen.getByLabelText("家庭 房租 本月預算")).toHaveValue("36000");

    fireEvent.click(screen.getByRole("button", { name: /下一組/ }));

    expect(await screen.findByText("本月分配完成")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /完成，查看預算使用/ })).toBeInTheDocument();
  });
});
