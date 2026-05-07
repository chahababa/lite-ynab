// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QuickEntryPage from "@/app/quick-entry/page";

const { mockReplace, mockPush, mockRefresh, fetchQuickEntryData, mockInsert } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  fetchQuickEntryData: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
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
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: (table: string) => {
      if (table === "transactions") {
        return { insert: mockInsert };
      }
      return {};
    },
  }),
}));

const QUICK_CATEGORIES = [
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
    id: "cat-coffee",
    groupId: "group-personal",
    groupName: "個人",
    name: "咖啡",
    isQuick: true,
    isAuto: false,
    autoAmount: 0,
    sortOrder: 20,
  },
];

describe("QuickEntryPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    fetchQuickEntryData.mockResolvedValue({
      allCategories: [
        ...QUICK_CATEGORIES,
        {
          id: "cat-rent",
          groupId: "group-home",
          groupName: "家庭",
          name: "房租",
          isQuick: false,
          isAuto: true,
          autoAmount: 12000,
          sortOrder: 30,
        },
      ],
      quickCategories: QUICK_CATEGORIES,
      paymentMethods: [
        { id: "pm-cash", name: "現金", sortOrder: 10 },
        { id: "pm-card", name: "信用卡 A", sortOrder: 20 },
      ],
    });
  });

  it("renders the dense layout with title 記一筆", async () => {
    render(createElement(QuickEntryPage));
    expect(await screen.findByText("記一筆")).toBeInTheDocument();
  });

  it("updates amount and note from keypad and input", async () => {
    render(createElement(QuickEntryPage));
    await screen.findByText("記一筆");

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));

    fireEvent.change(screen.getByPlaceholderText("備註（可留空）"), {
      target: { value: "早餐" },
    });

    expect(screen.getByText("−$120")).toBeInTheDocument();
    expect(screen.getByDisplayValue("早餐")).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("blocks submit and toasts when amount is zero", async () => {
    render(createElement(QuickEntryPage));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "個人 飲食" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "個人 飲食" }));

    await waitFor(() => {
      expect(screen.queryByText("請先輸入金額")).toBeInTheDocument();
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("submits successfully and clears amount/note (keeps payment method)", async () => {
    render(createElement(QuickEntryPage));
    await screen.findByText("記一筆");

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.change(screen.getByPlaceholderText("備註（可留空）"), {
      target: { value: "午餐" },
    });

    fireEvent.click(await screen.findByRole("button", { name: "個人 飲食" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 123,
        category_id: "cat-food",
        payment_method_id: "pm-cash",
        note: "午餐",
      }),
    );
    expect(await screen.findByText("已記帳 $123 至 飲食")).toBeInTheDocument();

    // amount/note 清空，pm 保留
    await waitFor(() => {
      expect(screen.getByText("−$0")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("備註（可留空）")).toHaveValue("");
    });
  });

  it("renders the 「+ 更多」 entry as the last grid cell", async () => {
    render(createElement(QuickEntryPage));
    await screen.findByText("記一筆");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "更多分類" })).toBeInTheDocument();
    });
  });
});
