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
      if (table === "transactions") return { insert: mockInsert };
      return {};
    },
  }),
}));

const RECENT_TEMPLATE_STORAGE_KEY = "lite-ynab.quick-entry.recent-templates.v1";

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

describe("QuickEntryPage (M3 v2.0)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
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

  it("renders M3 layout with title 記一筆 and segments", async () => {
    render(createElement(QuickEntryPage));
    expect(await screen.findByText("記一筆")).toBeInTheDocument();
    // segmented toggle
    expect(screen.getByRole("button", { name: "支出" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "轉帳" })).toBeInTheDocument();
  });

  it("shows parent group labels and badges on every quick category tile", async () => {
    render(createElement(QuickEntryPage));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "個人 飲食" })).toBeInTheDocument();
    });

    expect(screen.getAllByText("#個人")).toHaveLength(2);
    expect(screen.getByText("#家庭")).toBeInTheDocument();
    expect(screen.getAllByTitle("大項：個人")).toHaveLength(2);
    expect(screen.getByTitle("大項：家庭")).toBeInTheDocument();
  });

  it("places entry type, text entry, and recent templates at the bottom", async () => {
    window.localStorage.setItem(
      RECENT_TEMPLATE_STORAGE_KEY,
      JSON.stringify([
        {
          id: "recent-1",
          label: "個人-娛樂飲食(非必要)🟧 $300",
          amount: 300,
          categoryId: "cat-food",
          categoryName: "飲食",
          paymentMethodId: "pm-cash",
          paymentMethodName: "現金",
          note: "",
        },
      ]),
    );

    render(createElement(QuickEntryPage));

    const saveButton = await screen.findByRole("button", { name: "輸入金額後儲存" });
    const typeButton = screen.getByRole("button", { name: "支出" });
    const textEntryTitle = screen.getByText("文字記帳");
    const recentTitle = await screen.findByText("最近常用範本");

    expect(saveButton.compareDocumentPosition(typeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(typeButton.compareDocumentPosition(textEntryTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(textEntryTitle.compareDocumentPosition(recentTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("updates amount and note via keypad without rendering the removed guidance field", async () => {
    render(createElement(QuickEntryPage));
    await screen.findByText("記一筆");

    expect(
      screen.queryByText("先輸入金額，再點常用分類即可快速儲存；儲存後可從交易列表編輯 / 復原。"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));

    fireEvent.change(screen.getByPlaceholderText("備註（可留空）"), {
      target: { value: "早餐" },
    });

    expect(screen.getByText("−$120")).toBeInTheDocument();
    expect(screen.queryByText("點常用分類可立即儲存，或按下方儲存。")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("早餐")).toBeInTheDocument();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("toasts when 收入 / 轉帳 segments are tapped (v2.1 placeholder)", async () => {
    render(createElement(QuickEntryPage));
    await screen.findByText("記一筆");

    fireEvent.click(screen.getByRole("button", { name: "收入" }));
    expect(await screen.findByText("v2.1 即將支援收入 / 轉帳記帳")).toBeInTheDocument();
  });

  it("blocks submit and toasts when amount is zero", async () => {
    render(createElement(QuickEntryPage));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "個人 飲食" })).toBeInTheDocument();
    });
    // tap save without amount
    fireEvent.click(screen.getByRole("button", { name: /儲存/ }));
    await waitFor(() => {
      expect(screen.queryByText("請先輸入金額")).toBeInTheDocument();
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("blocks submit and toasts when no category is selected", async () => {
    render(createElement(QuickEntryPage));
    await screen.findByText("記一筆");

    // amount only
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: /儲存/ }));

    await waitFor(() => {
      expect(screen.queryByText("請先選擇分類")).toBeInTheDocument();
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("one-tap submits when amount + payment method are set and a quick category is tapped", async () => {
    render(createElement(QuickEntryPage));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "個人 飲食" })).toBeInTheDocument();
    });

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
    expect(screen.getByText("編輯 / 復原")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("−$0")).toBeInTheDocument();
    });
  });

  it("shows banner and blocks submit when no payment methods exist", async () => {
    fetchQuickEntryData.mockResolvedValue({
      allCategories: QUICK_CATEGORIES,
      quickCategories: QUICK_CATEGORIES,
      paymentMethods: [],
    });
    render(createElement(QuickEntryPage));
    await waitFor(() => {
      expect(screen.queryByText(/尚未建立支付方式/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "個人 飲食" }));
    fireEvent.click(screen.getByRole("button", { name: /儲存/ }));

    await waitFor(() => {
      expect(screen.queryByText("請先到設定建立支付方式")).toBeInTheDocument();
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("parses text entry and fills amount/category/payment candidates", async () => {
    render(createElement(QuickEntryPage));
    await screen.findByText("文字記帳");

    fireEvent.change(screen.getByLabelText("文字記帳內容"), {
      target: { value: "早餐 80 現金 個人/飲食" },
    });
    expect(screen.getByText(/預覽：\$80 · 飲食 · 現金/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "解析" }));

    expect(await screen.findByText("已解析文字記帳，確認後可儲存。")).toBeInTheDocument();
    expect(screen.getByText("−$80")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "個人 飲食" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "支付方式 現金" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("早餐")).toBeInTheDocument();
  });

  it("keeps relative text-entry dates anchored across repeated parse/apply cycles", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-18T04:00:00.000Z"));

    render(createElement(QuickEntryPage));
    await screen.findByText("文字記帳");

    fireEvent.change(screen.getByLabelText("文字記帳內容"), {
      target: { value: "昨天 早餐 80 現金 個人/飲食" },
    });

    fireEvent.click(screen.getByRole("button", { name: "解析" }));
    expect(await screen.findByRole("button", { name: "日期 2026-05-17" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "解析" }));
    expect(screen.getByRole("button", { name: "日期 2026-05-17" })).toBeInTheDocument();
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

  it("opens category picker modal when 「更多分類」 is clicked", async () => {
    render(createElement(QuickEntryPage));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /更多分類/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /更多分類/ }));
    expect(screen.getByRole("dialog", { name: "選擇分類" })).toBeInTheDocument();
  });

  it("opens payment method modal when payment chip is clicked", async () => {
    render(createElement(QuickEntryPage));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /支付方式/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /支付方式/ }));
    expect(screen.getByRole("dialog", { name: "選擇支付方式" })).toBeInTheDocument();
  });
});
