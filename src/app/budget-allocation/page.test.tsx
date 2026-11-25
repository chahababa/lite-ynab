// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BudgetAllocationPage from "@/app/budget-allocation/page";

const { fetchBudgetAllocationData, fetchBudgetReferenceData, fetchBudgetSuggestions, routerValue, db } = vi.hoisted(() => ({
  fetchBudgetSuggestions: vi.fn(),
  // Records every insert/delete and lets a test decide what a query returns.
  db: {
    calls: [] as { table: string; op: string; payload?: unknown }[],
    respond: (_table: string, _op: string): { data?: unknown; error: unknown } => ({ error: null }),
  },
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

vi.mock("@/lib/budgetSuggestion", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/budgetSuggestion")>();
  return { ...original, fetchBudgetSuggestions };
});

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
      const query = (op: string, payload?: unknown) => {
        if (op !== "select") db.calls.push({ table, op, payload });
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "order", "limit", "single", "maybeSingle"]) chain[method] = () => chain;
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(db.respond(table, op)).then(resolve);
        return chain;
      };
      return {
        select: () => query("select"),
        upsert: (payload: unknown) => query("upsert", payload),
        insert: (payload: unknown) => query("insert", payload),
        delete: () => query("delete"),
        update: (payload: unknown) => query("update", payload),
      };
    },
  }),
}));

describe("BudgetAllocationPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.calls = [];
    db.respond = () => ({ error: null });
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
          carryover: 0,
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
    fetchBudgetSuggestions.mockResolvedValue({});
  });

  it("renders summary and monthly planning actions", async () => {
    render(createElement(BudgetAllocationPage));

    expect(await screen.findByText("預算分配")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "複製上月預算" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批次套用固定預算" })).toBeInTheDocument();
    expect(screen.getByText("飲食")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("1200").length).toBeGreaterThan(0);
  });

  it("renders a desktop-first workspace with side summary and dense category table", async () => {
    render(createElement(BudgetAllocationPage));

    const workspace = await screen.findByTestId("budget-allocation-desktop-workspace");
    expect(workspace).toHaveClass("lg:grid-cols-[360px_minmax(0,1fr)]");
    expect(screen.getByText(/桌機版把收入、批次動作與分類明細分欄呈現/)).toBeInTheDocument();
    expect(screen.getByText("本月預算")).toBeInTheDocument();
    expect(screen.getByText("固定預算")).toBeInTheDocument();
  });

  it("labels each budget row numeric input with group, category, and budget type", async () => {
    render(createElement(BudgetAllocationPage));

    expect(await screen.findByRole("textbox", { name: "個人 飲食 固定預算" })).toHaveValue("1200");
    expect(screen.getByRole("textbox", { name: "個人 飲食 本月預算" })).toHaveValue("1200");
  });

  it("renders category and payment management sections", async () => {
    render(createElement(BudgetAllocationPage));

    expect(await screen.findByText("支付方式管理")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "個人 設定" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "飲食 設定" }).length).toBeGreaterThan(0);
  });

  it("uses Material dialogs for batch budget actions instead of window.confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    render(createElement(BudgetAllocationPage));

    fireEvent.click(await screen.findByRole("button", { name: "複製上月預算" }));

    expect(screen.getByRole("dialog", { name: "複製上月預算" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "套用上月預算" })).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  const typeAndConfirm = async (dialogName: string, value: string, confirmLabel: string) => {
    const dialog = await screen.findByRole("dialog", { name: dialogName });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value } });
    fireEvent.click(within(dialog).getByRole("button", { name: confirmLabel }));
  };

  it("每個大項底下有「新增小項」按鈕，新增後出現在該大項", async () => {
    db.respond = (table, op) =>
      op === "insert" ? { data: { id: table === "categories" ? "cat-new" : "budget-new" }, error: null } : { error: null };
    render(createElement(BudgetAllocationPage));

    fireEvent.click(await screen.findByRole("button", { name: "在 個人 新增小項" }));
    await typeAndConfirm("新增「個人」小項", "咖啡", "新增小項");

    expect(await screen.findByText("已在「個人」新增小項「咖啡」。")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "個人 咖啡 本月預算" })).toHaveValue("0");
    expect(db.calls.find((call) => call.table === "categories")?.payload).toMatchObject({
      category_group_id: "group-personal",
      name: "咖啡",
    });
  });

  it("「新增大項」分兩步：大項名稱、第一個小項，確認後才寫入並顯示", async () => {
    db.respond = (table, op) => {
      if (table === "category_groups" && op === "select") return { data: null, error: null };
      if (op === "insert") return { data: { id: `${table}-new` }, error: null };
      return { error: null };
    };
    render(createElement(BudgetAllocationPage));

    fireEvent.click(await screen.findByRole("button", { name: "新增大項" }));
    await typeAndConfirm("新增大項", "寵物", "下一步");
    expect(db.calls).toHaveLength(0);
    await typeAndConfirm("「寵物」的第一個小項", "飼料", "新增大項與小項");

    expect(await screen.findByText("已新增大項「寵物」與小項「飼料」。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "寵物 設定" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "寵物 飼料 本月預算" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(db.calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      "category_groups:insert",
      "categories:insert",
      "budgets:insert",
    ]);
    expect(db.calls[0].payload).toMatchObject({ name: "寵物", sort_order: 10 });
    expect(db.calls[1].payload).toMatchObject({ category_group_id: "category_groups-new", name: "飼料" });
  });

  it("大項名稱已存在時不進到第二步，也不寫入", async () => {
    render(createElement(BudgetAllocationPage));

    fireEvent.click(await screen.findByRole("button", { name: "新增大項" }));
    await typeAndConfirm("新增大項", "個人", "下一步");

    expect(await screen.findByText(/已經有「個人」這個大項了/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(db.calls).toHaveLength(0);
  });

  it("小項建立失敗時，把剛建立的大項收回", async () => {
    db.respond = (table, op) => {
      if (table === "category_groups" && op === "select") return { data: null, error: null };
      if (table === "categories" && op === "insert") return { data: null, error: { message: "boom" } };
      if (op === "insert") return { data: { id: "group-new" }, error: null };
      return { error: null };
    };
    render(createElement(BudgetAllocationPage));

    fireEvent.click(await screen.findByRole("button", { name: "新增大項" }));
    await typeAndConfirm("新增大項", "寵物", "下一步");
    await typeAndConfirm("「寵物」的第一個小項", "飼料", "新增大項與小項");

    expect(await screen.findByText("新增大項失敗：boom")).toBeInTheDocument();
    expect(db.calls.at(-1)).toMatchObject({ table: "category_groups", op: "delete" });
    expect(screen.queryByRole("button", { name: "寵物 設定" })).not.toBeInTheDocument();
  });

  it("沒有建議時「套用建議預算」不能按，並說明原因", async () => {
    render(createElement(BudgetAllocationPage));

    expect(await screen.findByRole("button", { name: "套用建議預算" })).toBeDisabled();
    expect(screen.getByText(/紀錄還不夠，暫時沒有建議/)).toBeInTheDocument();
  });

  it("套用建議預算前先列出調整內容，確認後才寫入", async () => {
    fetchBudgetSuggestions.mockResolvedValue({
      "cat-food": { suggested: 2500, average: 2130, max: 3000, activeMonths: 3, months: 3 },
    });
    render(createElement(BudgetAllocationPage));

    fireEvent.click(await screen.findByRole("button", { name: "套用建議預算" }));

    const dialog = await screen.findByRole("dialog", { name: "套用建議預算" });
    expect(within(dialog).getByText(/調整 1 個小項，合計 \$1,200 → \$2,500/)).toBeInTheDocument();
    expect(within(dialog).getByText("$1,200 → $2,500")).toBeInTheDocument();
    expect(db.calls).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "套用建議預算" }));

    expect(await screen.findByText("已依建議調整 1 個小項的預算。")).toBeInTheDocument();
    expect(db.calls).toEqual([{ table: "budgets", op: "update", payload: { allocated: 2500 } }]);
    expect(screen.getByRole("textbox", { name: "個人 飲食 本月預算" })).toHaveValue("2500");
  });
});
