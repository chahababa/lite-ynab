// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QuickEntryPage from "@/app/quick-entry/page";
import { getBudgetHint } from "@/app/quick-entry/components/QuickCategoryGrid";

const { mockReplace, mockPush, mockRefresh, fetchQuickEntryData, mockInsert, mockInsertSingle, mockDeleteEq } =
  vi.hoisted(() => ({
    mockReplace: vi.fn(),
    mockPush: vi.fn(),
    mockRefresh: vi.fn(),
    fetchQuickEntryData: vi.fn(),
    mockInsert: vi.fn(),
    mockInsertSingle: vi.fn(),
    mockDeleteEq: vi.fn(),
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
        return { insert: mockInsert, delete: () => ({ eq: mockDeleteEq }) };
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
    id: "cat-family-food",
    groupId: "group-home",
    groupName: "家庭",
    name: "飲食",
    isQuick: true,
    isAuto: false,
    autoAmount: 0,
    sortOrder: 15,
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

const PAYMENT_METHODS = [
  { id: "pm-cash", name: "現金", sortOrder: 10 },
  { id: "pm-card", name: "信用卡 A", sortOrder: 20 },
  { id: "pm-old", name: "舊卡", sortOrder: 30 },
];

function createQuickEntryData(overrides: Record<string, unknown> = {}) {
  return {
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
    paymentMethods: PAYMENT_METHODS,
    quickPaymentMethods: PAYMENT_METHODS.slice(0, 2),
    budgetStatusByCategory: {
      "cat-food": { available: 5000, spent: 1800 },
      "cat-family-food": { available: 3000, spent: 3420 },
      "cat-coffee": { available: 0, spent: 250 },
    },
    monthSummary: { available: 8000, spent: 5470 },
    ...overrides,
  };
}

describe("QuickEntryPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertSingle.mockResolvedValue({ data: { id: "tx-new" }, error: null });
    mockInsert.mockReturnValue({ select: () => ({ single: mockInsertSingle }) });
    mockDeleteEq.mockResolvedValue({ error: null });
    fetchQuickEntryData.mockResolvedValue(createQuickEntryData());
  });

  async function waitForTiles() {
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "個人 飲食" })).toBeInTheDocument();
    });
  }

  it("renders the title and no longer shows the removed income / transfer, text entry and template blocks", async () => {
    window.localStorage.setItem(
      "lite-ynab.quick-entry.recent-templates.v1",
      JSON.stringify([{ id: "recent-1", label: "飲食 $300", amount: 300 }]),
    );

    render(createElement(QuickEntryPage));
    expect(await screen.findByText("記一筆")).toBeInTheDocument();
    await waitForTiles();

    expect(screen.queryByRole("button", { name: "收入" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "轉帳" })).not.toBeInTheDocument();
    expect(screen.queryByText("文字記帳")).not.toBeInTheDocument();
    expect(screen.queryByText("最近常用範本")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "關閉" })).not.toBeInTheDocument();
  });

  it("shows the month summary with remaining and total budget", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    expect(screen.getByRole("link", { name: /本月還能花 \$2,530/ })).toHaveTextContent("預算 $8,000");
  });

  it("flags the month summary when the whole month is overspent", async () => {
    fetchQuickEntryData.mockResolvedValue(
      createQuickEntryData({ monthSummary: { available: 5000, spent: 6200 } }),
    );
    render(createElement(QuickEntryPage));
    await waitForTiles();

    expect(screen.getByText("本月超支 $1,200")).toBeInTheDocument();
  });

  it("hides the month summary when no budget is set", async () => {
    fetchQuickEntryData.mockResolvedValue(
      createQuickEntryData({ monthSummary: { available: 0, spent: 900 } }),
    );
    render(createElement(QuickEntryPage));
    await waitForTiles();

    expect(screen.queryByText(/本月還能花/)).not.toBeInTheDocument();
    expect(screen.queryByText(/本月超支/)).not.toBeInTheDocument();
  });

  it("shows remaining, overspent and spent-only hints on category tiles", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    expect(screen.getByRole("button", { name: "個人 飲食" })).toHaveTextContent("剩 $3,200");
    expect(screen.getByRole("button", { name: "家庭 飲食" })).toHaveTextContent("超 $420");
    expect(screen.getByRole("button", { name: "個人 咖啡" })).toHaveTextContent("已花 $250");
  });

  it("shows the group label on every tile so same-named categories stay distinguishable", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    expect(screen.getByRole("button", { name: "個人 飲食" })).toHaveTextContent("飲食個人");
    expect(screen.getByRole("button", { name: "家庭 飲食" })).toHaveTextContent("飲食家庭");
    expect(screen.getByRole("button", { name: "個人 咖啡" })).toHaveTextContent("咖啡個人");
  });

  it("updates amount and note via keypad", async () => {
    render(createElement(QuickEntryPage));
    await screen.findByText("記一筆");

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));

    // 備註預設收摺，需先點「＋ 加備註」展開
    expect(screen.queryByPlaceholderText("備註（可留空）")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "＋ 加備註" }));

    fireEvent.change(screen.getByPlaceholderText("備註（可留空）"), {
      target: { value: "早餐" },
    });

    expect(screen.getByText("−$120")).toBeInTheDocument();
    expect(screen.getByDisplayValue("早餐")).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("keeps the keypad above the category grid so late-loading tiles never shift input", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    const keypadOne = screen.getByRole("button", { name: "1" });
    const categoryTile = screen.getByRole("button", { name: "個人 飲食" });
    expect(
      keypadOne.compareDocumentPosition(categoryTile) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("blocks submit and toasts when amount is zero", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    fireEvent.click(screen.getByRole("button", { name: /儲存/ }));
    await waitFor(() => {
      expect(screen.queryByText("請先輸入金額")).toBeInTheDocument();
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("blocks submit and toasts when no category is selected", async () => {
    render(createElement(QuickEntryPage));
    await screen.findByText("記一筆");

    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: /儲存/ }));

    await waitFor(() => {
      expect(screen.queryByText("請先選擇分類")).toBeInTheDocument();
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("one-tap submits when amount + payment method are set and a quick category is tapped", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "個人 飲食" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 123,
        category_id: "cat-food",
        payment_method_id: "pm-cash",
        note: "",
        source: "manual",
        source_text: null,
        source_id: null,
        metadata: { entrypoint: "quick-entry" },
      }),
    );
    expect(await screen.findByText("已記帳 $123 至 飲食")).toBeInTheDocument();
    expect(screen.getByText("已儲存 飲食 $123（現金）")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("−$0")).toBeInTheDocument();
    });
    // 儲存後重新取數字，格子上的「還剩多少」才會更新
    await waitFor(() => {
      expect(fetchQuickEntryData).toHaveBeenCalledTimes(2);
    });
  });

  it("undoes the transaction just saved without leaving the page", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    fireEvent.click(screen.getByRole("button", { name: "8" }));
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "個人 飲食" }));

    fireEvent.click(await screen.findByRole("button", { name: "復原" }));

    await waitFor(() => {
      expect(mockDeleteEq).toHaveBeenCalledWith("id", "tx-new");
    });
    expect(await screen.findByText("已復原 飲食 $85")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "復原" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(fetchQuickEntryData).toHaveBeenCalledTimes(3);
    });
  });

  it("keeps the saved notice and explains when undo fails", async () => {
    mockDeleteEq.mockResolvedValue({ error: new Error("network") });
    render(createElement(QuickEntryPage));
    await waitForTiles();

    fireEvent.click(screen.getByRole("button", { name: "8" }));
    fireEvent.click(screen.getByRole("button", { name: "個人 飲食" }));
    fireEvent.click(await screen.findByRole("button", { name: "復原" }));

    expect(await screen.findByText("復原失敗，請到交易頁刪除這一筆")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "復原" })).toBeInTheDocument();
  });

  it("shows banner and blocks submit when no payment methods exist", async () => {
    fetchQuickEntryData.mockResolvedValue(
      createQuickEntryData({ paymentMethods: [], quickPaymentMethods: [] }),
    );
    render(createElement(QuickEntryPage));
    await waitFor(() => {
      expect(screen.queryByText(/尚未建立支付方式/)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "預算分配" })).toHaveAttribute("href", "/budget-allocation");

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "個人 飲食" }));
    fireEvent.click(screen.getByRole("button", { name: /儲存/ }));

    await waitFor(() => {
      expect(screen.queryByText("請先建立支付方式")).toBeInTheDocument();
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("shows the two most-used payment methods as buttons and saves with the tapped one", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    expect(screen.getByRole("button", { name: "支付方式 現金" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "支付方式 舊卡" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "支付方式 信用卡 A" }));
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    fireEvent.click(screen.getByRole("button", { name: "個人 飲食" }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 9, payment_method_id: "pm-card" }),
      );
    });
  });

  it("opens the payment method modal from 更多 and surfaces a method picked there", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    fireEvent.click(screen.getByRole("button", { name: "更多支付方式" }));
    const dialog = screen.getByRole("dialog", { name: "選擇支付方式" });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "舊卡" }));

    expect(screen.getByRole("button", { name: "支付方式 舊卡" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "支付方式 現金" })).toBeInTheDocument();
  });

  it("hides 更多 when every payment method already fits on the page", async () => {
    fetchQuickEntryData.mockResolvedValue(
      createQuickEntryData({
        paymentMethods: PAYMENT_METHODS.slice(0, 2),
        quickPaymentMethods: PAYMENT_METHODS.slice(0, 2),
      }),
    );
    render(createElement(QuickEntryPage));
    await waitForTiles();

    expect(screen.queryByRole("button", { name: "更多支付方式" })).not.toBeInTheDocument();
  });

  it("opens date bottom sheet instead of window.prompt", async () => {
    const promptSpy = vi.spyOn(window, "prompt");
    render(createElement(QuickEntryPage));
    await screen.findByText("記一筆");

    fireEvent.click(screen.getByRole("button", { name: /日期/ }));

    expect(screen.getByRole("dialog", { name: "選擇日期" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /昨天/ })).toBeInTheDocument();
    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("opens the category picker from 其他 and names the picked category on the save button", async () => {
    render(createElement(QuickEntryPage));
    await waitForTiles();

    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "其他分類" }));
    const dialog = screen.getByRole("dialog", { name: "選擇分類" });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /房租/ }));

    expect(await screen.findByRole("button", { name: "儲存到 房租" })).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("getBudgetHint", () => {
  it("returns nothing for a category with no budget and no spending", () => {
    expect(getBudgetHint(undefined)).toBeNull();
    expect(getBudgetHint({ available: 0, spent: 0 })).toBeNull();
  });

  it("treats spending exactly at the budget as zero remaining, not overspent", () => {
    expect(getBudgetHint({ available: 1000, spent: 1000 })).toEqual({ text: "剩 $0", isOver: false });
  });

  it("reports the overspent amount as a positive number", () => {
    expect(getBudgetHint({ available: 1000, spent: 1250 })).toEqual({ text: "超 $250", isOver: true });
  });
});
