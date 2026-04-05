// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TransactionsPage from "@/app/transactions/page";

const { fetchTransactionsPageData, routerValue } = vi.hoisted(() => ({
  fetchTransactionsPageData: vi.fn(),
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
  fetchTransactionsPageData,
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
      update: () => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      delete: () => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  }),
}));

describe("TransactionsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchTransactionsPageData.mockResolvedValue({
      user: { email: "demo@example.com" },
      categories: [
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
      paymentMethods: [
        { id: "pm-cash", name: "現金", sortOrder: 10 },
        { id: "pm-card", name: "信用卡 A", sortOrder: 20 },
      ],
      transactions: [
        {
          id: "tx-1",
          user_id: "user-1",
          date: "2026-04-01",
          amount: 100,
          category_id: "cat-food",
          payment_method_id: "pm-cash",
          note: "早餐",
          categoryGroupName: "個人",
          categoryName: "飲食",
          paymentMethodName: "現金",
        },
        {
          id: "tx-2",
          user_id: "user-1",
          date: "2026-04-02",
          amount: 12000,
          category_id: "cat-rent",
          payment_method_id: "pm-card",
          note: "四月房租",
          categoryGroupName: "家庭",
          categoryName: "房租",
          paymentMethodName: "信用卡 A",
        },
      ],
    });
  });

  it("renders filter controls and export button", async () => {
    render(createElement(TransactionsPage));

    expect(await screen.findByText("全部交易")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CSV/i })).toBeInTheDocument();
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(3);
  });

  it("filters transactions by keyword", async () => {
    render(createElement(TransactionsPage));

    await screen.findByText("全部交易");
    const searchInput = screen.getByPlaceholderText("可搜尋分類、支付方式、備註、日期");

    fireEvent.change(searchInput, { target: { value: "早餐" } });

    await waitFor(() => {
      expect(screen.getByText("早餐")).toBeInTheDocument();
      expect(screen.queryByText("四月房租")).not.toBeInTheDocument();
    });
  });

  it("filters transactions by payment method", async () => {
    render(createElement(TransactionsPage));

    await screen.findByText("全部交易");
    const selects = screen.getAllByRole("combobox");

    fireEvent.change(selects[1], { target: { value: "pm-card" } });

    await waitFor(() => {
      expect(screen.getByText("四月房租")).toBeInTheDocument();
      expect(screen.queryByText("早餐")).not.toBeInTheDocument();
    });
  });
});
