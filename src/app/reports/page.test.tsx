// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReportsPage from "@/app/reports/page";

const { fetchReportsData, routerValue } = vi.hoisted(() => ({
  fetchReportsData: vi.fn(),
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
  fetchReportsData,
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

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchReportsData.mockResolvedValue({
      user: { email: "demo@example.com" },
      period: {
        mode: "month",
        startMonthId: "2026-04",
        endMonthId: "2026-04",
        monthCount: 1,
        previousStartMonthId: "2026-03",
        previousEndMonthId: "2026-03",
      },
      summary: {
        income: 50000,
        allocated: 30000,
        spent: 18200,
        unallocated: 20000,
        remainingAfterSpending: 31800,
        transactionCount: 6,
        overspentCount: 1,
        previousSpent: 16000,
        deltaSpent: 2200,
      },
      categoryGroups: [
        {
          id: "group-personal",
          name: "個人",
          allocated: 10000,
          spent: 6200,
          remaining: 3800,
          transactionCount: 3,
          previousSpent: 5000,
          deltaSpent: 1200,
        },
      ],
      groupDetails: [
        {
          group: {
            id: "group-personal",
            name: "個人",
            allocated: 10000,
            spent: 6200,
            remaining: 3800,
            transactionCount: 3,
            previousSpent: 5000,
            deltaSpent: 1200,
          },
          categories: [
            {
              id: "cat-food",
              name: "飲食",
              allocated: 6000,
              spent: 4200,
              remaining: 1800,
              transactionCount: 2,
              previousSpent: 3000,
              deltaSpent: 1200,
            },
          ],
        },
      ],
      categories: [
        {
          id: "cat-food",
          name: "飲食",
          allocated: 6000,
          spent: 4200,
          remaining: 1800,
          transactionCount: 2,
          previousSpent: 3000,
          deltaSpent: 1200,
        },
      ],
      paymentMethods: [
        {
          id: "pm-cash",
          name: "現金",
          spent: 4200,
          transactionCount: 2,
          previousSpent: 3600,
          deltaSpent: 600,
          share: 0.23,
        },
      ],
      trend: [
        {
          monthId: "2026-04",
          label: "2026年 4月",
          income: 50000,
          allocated: 30000,
          spent: 18200,
          unallocated: 20000,
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
    });

    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("renders report page and supports export actions", async () => {
    render(createElement(ReportsPage));

    expect(await screen.findByText("報表分析")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CSV/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Excel/i })).toBeInTheDocument();

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: /CSV/i }));
    fireEvent.click(screen.getByRole("button", { name: /Excel/i }));

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(2);
    });

    clickSpy.mockRestore();
  });
});
