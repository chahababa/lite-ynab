// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "@/app/page";

const {
  mockReplace,
  mockRefresh,
  fetchDashboardData,
  mockOnAuthStateChange,
  mockUpsert,
  mockInsert,
} = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
  fetchDashboardData: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockUpsert: vi.fn(),
  mockInsert: vi.fn(),
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
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: (table: string) => {
      if (table === "monthly_incomes") {
        return {
          upsert: mockUpsert,
        };
      }

      if (table === "transactions") {
        return {
          insert: mockInsert,
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }

      return {
        update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    },
  }),
}));

describe("DashboardPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
    mockUpsert.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: null });

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
        {
          id: "cat-rent",
          groupId: "group-home",
          groupName: "家庭",
          name: "房租",
          isQuick: false,
          isAuto: true,
          autoAmount: 12000,
          sortOrder: 20,
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
      income: {
        id: "income-1",
        user_id: "user-1",
        month_id: "2026-04",
        amount: 50000,
      },
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

  it("renders dashboard data shell", async () => {
    render(createElement(DashboardPage));

    await waitFor(() => {
      expect(screen.getByDisplayValue("50000")).toBeInTheDocument();
    });

    expect(screen.getAllByText("$20,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$120").length).toBeGreaterThan(0);
    expect(screen.getByText("最近交易")).toBeInTheDocument();
  });

  it("opens the expense popup from the dashboard", async () => {
    render(createElement(DashboardPage));

    fireEvent.click(screen.getAllByRole("button", { name: "打開記帳視窗" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("搜尋分類名稱或群組")).toBeInTheDocument();
    });
  });

  it("shows zero-amount validation in the dashboard quick-entry modal", async () => {
    render(createElement(DashboardPage));

    fireEvent.click(screen.getAllByRole("button", { name: "打開記帳視窗" })[0]);
    await screen.findByRole("dialog");
    fireEvent.click(
      screen
        .getAllByText("飲食")
        .find((element) => element.closest("button"))
        ?.closest("button") as HTMLElement,
    );

    expect(await screen.findByText("請輸入大於 0 的金額")).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
