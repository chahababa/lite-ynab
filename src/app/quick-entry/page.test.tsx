// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QuickEntryPage from "@/app/quick-entry/page";

const { mockReplace, mockRefresh, fetchQuickEntryData, mockInsert } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
  fetchQuickEntryData: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    refresh: mockRefresh,
  }),
}));

vi.mock("@/lib/data", () => ({
  fetchQuickEntryData,
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
    from: (table: string) => {
      if (table === "transactions") {
        return {
          insert: mockInsert,
        };
      }

      return {};
    },
  }),
}));

describe("QuickEntryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    fetchQuickEntryData.mockResolvedValue({
      allCategories: [
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
      paymentMethods: [
        { id: "pm-cash", name: "現金", sortOrder: 10 },
        { id: "pm-card", name: "信用卡 A", sortOrder: 20 },
      ],
    });
  });

  it("updates amount and note in quick entry", async () => {
    render(createElement(QuickEntryPage));

    await screen.findByRole("button", { name: "快速記帳" });

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));

    fireEvent.change(screen.getByPlaceholderText("補充這筆交易的用途或對象"), {
      target: { value: "早餐" },
    });

    expect(screen.getAllByText("$120")[0]).toBeInTheDocument();
    expect(screen.getByDisplayValue("早餐")).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("shows all categories after switching to the all-categories tab", async () => {
    render(createElement(QuickEntryPage));

    fireEvent.click((await screen.findAllByRole("button", { name: "全部分類" }))[0]);

    await waitFor(() => {
      expect(screen.getByText("房租")).toBeInTheDocument();
      expect(screen.getByText("家庭")).toBeInTheDocument();
    });
  });

  it("filters categories with the search box", async () => {
    render(createElement(QuickEntryPage));

    fireEvent.click((await screen.findAllByRole("button", { name: "全部分類" }))[0]);

    fireEvent.change(screen.getAllByPlaceholderText("搜尋分類名稱或大項名稱")[0], {
      target: { value: "房租" },
    });

    await waitFor(() => {
      expect(screen.getByText("房租")).toBeInTheDocument();
    });
  });
});
