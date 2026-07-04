// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "@/app/dashboard/page";

const {
  mockReplace,
  mockRefresh,
  fetchDashboardData,
  mockOnAuthStateChange,
  mockUpsert,
} = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
  fetchDashboardData: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    refresh: mockRefresh,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/lib/data", () => ({
  fetchDashboardData,
}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { onAuthStateChange: mockOnAuthStateChange },
    from: (table: string) => {
      if (table === "monthly_incomes") return { upsert: mockUpsert };
      return {
        update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    },
  }),
}));

describe("DashboardPage (M3 v2.0)", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockUpsert.mockResolvedValue({ error: null });

    fetchDashboardData.mockResolvedValue({
      user: { email: "demo@example.com" },
      categoryOptions: [
        {
          id: "cat-food",
          groupId: "group-personal",
          groupName: "個人",
          name: "飲食",
          isQuick: true,
          isAuto: false,
          autoAmount: 0,
          sortOrder: 10,
        },
      ],
      paymentMethods: [{ id: "pm-cash", name: "現金", sortOrder: 10 }],
      budgetRows: [
        {
          budgetId: "budget-food",
          categoryId: "cat-food",
          categoryGroupId: "group-personal",
          categoryGroupName: "個人",
          categoryName: "飲食",
          allocated: 8000,
          carryover: 0,
          spent: 1200,
          remaining: 6800,
          isQuick: true,
          isAuto: false,
          autoAmount: 0,
          warning: null,
        },
      ],
      recentTransactions: [
        {
          id: "tx-1",
          user_id: "user-1",
          date: "2026-04-01",
          amount: 120,
          category_id: "cat-food",
          payment_method_id: "pm-cash",
          note: "早餐",
          categoryGroupName: "個人",
          categoryName: "飲食",
          paymentMethodName: "現金",
        },
      ],
      income: { id: "income-1", user_id: "user-1", month_id: "2026-04", amount: 50000 },
      unallocated: 20000,
      quickCategories: [
        {
          id: "cat-food",
          groupId: "group-personal",
          groupName: "個人",
          name: "飲食",
          isQuick: true,
          isAuto: false,
          autoAmount: 0,
          sortOrder: 10,
        },
      ],
    });
  });

  it("renders M3 dashboard with hero balance + tonal summary cards", async () => {
    render(createElement(DashboardPage));
    expect(await screen.findByText("主控臺")).toBeInTheDocument();

    // remain budget = 8000 - 1200 = 6800 → $6,800 in hero
    await waitFor(() => {
      expect(screen.getByText("$6,800")).toBeInTheDocument();
    });

    // tonal cards: 收入 / 支出 / 結餘
    expect(screen.getByText("收入")).toBeInTheDocument();
    expect(screen.getByText("支出")).toBeInTheDocument();
    expect(screen.getByText("結餘")).toBeInTheDocument();
    // income 50000, expense 1200, save 50000-1200=48800
    expect(screen.getByText("$50,000")).toBeInTheDocument();
    expect(screen.getAllByText("$1,200").length).toBeGreaterThan(0);
    expect(screen.getByText("$48,800")).toBeInTheDocument();
  });

  it("renders categories grid with progress and recent transactions", async () => {
    render(createElement(DashboardPage));
    await screen.findByText("主控臺");

    expect(await screen.findByText("分類預算")).toBeInTheDocument();
    expect(screen.getByText("飲食")).toBeInTheDocument();
    expect(screen.getByText("最近交易")).toBeInTheDocument();
    // recent tx amount 120 with expense minus
    expect(screen.getByText("−$120")).toBeInTheDocument();
  });

  it("「記一筆」 button links to /quick-entry and sits inside hero card as a compact pill", async () => {
    render(createElement(DashboardPage));
    await screen.findByText("主控臺");
    const link = screen.getByLabelText("記一筆");
    expect(link.getAttribute("href")).toBe("/quick-entry");
    expect(link).toHaveClass("absolute", "right-6", "top-9", "h-14", "w-24", "rounded-full");
  });

  it("opens income edit dialog and saves new income value", async () => {
    render(createElement(DashboardPage));
    await screen.findByText("主控臺");
    fireEvent.click(screen.getByLabelText("編輯本月收入"));

    const input = await screen.findByLabelText("本月收入金額");
    fireEvent.change(input, { target: { value: "60000" } });
    fireEvent.click(screen.getByRole("button", { name: /儲存/ }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalled();
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 60000 }),
      expect.anything(),
    );
  });
});
