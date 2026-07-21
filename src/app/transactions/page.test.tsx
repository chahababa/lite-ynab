// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const deleteEq = vi.fn().mockResolvedValue({ error: null });
const updateMaybeSingle = vi.fn().mockResolvedValue({ data: { id: "tx-1" }, error: null });
const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
const updateEq = vi.fn(() => ({ select: updateSelect }));
const update = vi.fn(() => ({ eq: updateEq }));

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
      update,
      delete: () => ({
        eq: deleteEq,
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
    deleteEq.mockResolvedValue({ error: null });
    updateMaybeSingle.mockResolvedValue({ data: { id: "tx-1" }, error: null });
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
    expect(screen.getByRole("button", { name: "匯出 CSV" })).toBeInTheDocument();
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

  it("opens a custom delete confirmation modal", async () => {
    render(createElement(TransactionsPage));

    await screen.findByText("全部交易");
    fireEvent.click(screen.getAllByRole("button", { name: "刪除交易" })[0]);

    expect(await screen.findByText("確定要刪除這筆交易嗎？")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "確認刪除交易" })).toHaveTextContent("房租");
    expect(screen.getByRole("dialog", { name: "確認刪除交易" })).toHaveTextContent("2026-04-02");

    fireEvent.click(screen.getByRole("button", { name: "確定刪除" }));

    await waitFor(() => {
      expect(deleteEq).toHaveBeenCalled();
      expect(screen.getByText("已刪除交易")).toBeInTheDocument();
    });
  });

  it("shows the exact save CTA label and cancel action", async () => {
    render(createElement(TransactionsPage));

    await screen.findByText("全部交易");
    fireEvent.click(screen.getAllByRole("button", { name: "編輯交易" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "編輯交易" });
    // The whole edit modal must layer above the global BottomNav (z-[999])
    // so a normal tap on 儲存更新 is not intercepted on mobile.
    expect(dialog.className).toContain("z-[1000]");
    const scope = within(dialog);
    const save = scope.getByRole("button", { name: "儲存更新" });
    const cancel = scope.getByRole("button", { name: "取消" });
    expect(save).toBeInTheDocument();
    expect(cancel).toBeInTheDocument();
    // Modal action touch targets must be at least 44px high (min-h-11 = 2.75rem).
    expect(save.className).toContain("min-h-11");
    expect(cancel.className).toContain("min-h-11");
    expect(scope.queryByRole("button", { name: "儲存" })).not.toBeInTheDocument();
  });

  it("scopes an opaque primary hover/active/focus override on the save CTA for WCAG AA contrast", async () => {
    render(createElement(TransactionsPage));

    await screen.findByText("全部交易");
    fireEvent.click(screen.getAllByRole("button", { name: "編輯交易" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "編輯交易" });
    const save = within(dialog).getByRole("button", { name: "儲存更新" });
    // The shared filled hover (hover:bg-primary/90) dilutes the surface toward
    // white and computes 3.84:1 for the white label — below WCAG AA 4.5:1.
    // Scope an opaque primary hover/active/focus surface (bg-primary = 4.5:1)
    // that reliably overrides the diluted shared hover via !important, since
    // cn() is a plain join and does not merge conflicting Tailwind utilities.
    expect(save.className).toContain("hover:!bg-primary");
    expect(save.className).toContain("active:!bg-primary");
    expect(save.className).toContain("focus-visible:!bg-primary");
  });

  it("saves every edited field and closes the modal", async () => {
    render(createElement(TransactionsPage));

    await screen.findByText("全部交易");
    fireEvent.click(screen.getAllByRole("button", { name: "編輯交易" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "編輯交易" });
    const scope = within(dialog);
    fireEvent.change(scope.getByLabelText("金額"), { target: { value: "1141" } });
    fireEvent.change(scope.getByLabelText("日期"), { target: { value: "2026-04-15" } });
    fireEvent.change(scope.getByLabelText("支付方式"), { target: { value: "pm-cash" } });
    fireEvent.change(scope.getByLabelText("分類"), { target: { value: "cat-food" } });
    fireEvent.change(scope.getByLabelText("備註"), { target: { value: "更新後備註" } });
    fireEvent.click(scope.getByRole("button", { name: "儲存更新" }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        amount: 1141,
        date: "2026-04-15",
        category_id: "cat-food",
        payment_method_id: "pm-cash",
        note: "更新後備註",
      });
      expect(updateEq).toHaveBeenCalledWith("id", "tx-2");
      expect(updateSelect).toHaveBeenCalledWith("id");
      expect(updateMaybeSingle).toHaveBeenCalledTimes(1);
      expect(dialog).not.toBeInTheDocument();
      expect(screen.getByText("交易已更新。")).toBeInTheDocument();
    });
  });

  it("shows an inline alert and keeps the dialog open when no row is updated", async () => {
    updateMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    render(createElement(TransactionsPage));

    await screen.findByText("全部交易");
    fireEvent.click(screen.getAllByRole("button", { name: "編輯交易" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "編輯交易" });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存更新" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(/找不到這筆交易，或目前帳號沒有權限更新。/);
    // Inline error must use a stronger semantic pairing for WCAG AA contrast.
    expect(alert.className).toContain("bg-money-expense");
    expect(alert.className).toContain("text-white");
    expect(alert.className).not.toContain("text-money-expense");
    expect(screen.getByRole("dialog", { name: "編輯交易" })).toBeInTheDocument();
  });

  it("disables the CTA and shows the exact pending label while saving", async () => {
    let resolveMaybeSingle: (value: { data: { id: string }; error: null }) => void =
      () => {};
    updateMaybeSingle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMaybeSingle = resolve;
        }),
    );

    render(createElement(TransactionsPage));

    await screen.findByText("全部交易");
    fireEvent.click(screen.getAllByRole("button", { name: "編輯交易" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "編輯交易" });
    fireEvent.click(within(dialog).getByRole("button", { name: "儲存更新" }));

    const pendingCta = await within(dialog).findByRole("button", { name: "儲存中…" });
    expect(pendingCta).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "儲存更新" })).not.toBeInTheDocument();

    resolveMaybeSingle({ data: { id: "tx-2" }, error: null });

    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
  });

  it("renders a bounded flex modal with a scrollable body and sticky safe-area footer", async () => {
    render(createElement(TransactionsPage));

    await screen.findByText("全部交易");
    fireEvent.click(screen.getAllByRole("button", { name: "編輯交易" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "編輯交易" });
    const scope = within(dialog);

    const container = scope.getByTestId("edit-modal-container");
    expect(container.className).toContain("flex");
    expect(container.className).toContain("flex-col");
    expect(container.className).toContain("max-h-[92vh]");
    expect(container.className).toContain("overflow-hidden");

    const body = scope.getByTestId("edit-modal-body");
    expect(body.className).toContain("min-h-0");
    expect(body.className).toContain("flex-1");
    expect(body.className).toContain("overflow-y-auto");

    const footer = scope.getByTestId("edit-modal-footer");
    expect(footer.className).toContain("sticky");
    expect(footer.className).toContain("bottom-0");
    expect(footer.className).toContain("env(safe-area-inset-bottom)");

    // Footer holds the always-visible CTA; the scrolling region does not.
    expect(within(footer).getByRole("button", { name: "儲存更新" })).toBeInTheDocument();
    expect(within(body).queryByRole("button", { name: "儲存更新" })).not.toBeInTheDocument();
  });
});
