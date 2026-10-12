// @vitest-environment jsdom
// MOCK_UI: actual component, synthetic session/network only; no authenticated DB/browser E2E.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CtbcInboxClient } from "./CtbcInboxClient";
import type { CtbcCandidate, CtbcInboxData } from "@/lib/ctbcInbox";

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "synthetic-session" } } }) } }),
}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const candidate: CtbcCandidate = {
  id: id(1), batch_id: id(2), occurred_at: "2026-10-10T04:00:00Z", amount: 100, merchant: "測試商家",
  product: null, card_role: null, bank_category: null, suggested_payment_id: null, warnings: [], late: false,
  status: "needs_review", version: 1, created_at: "2026-10-10T04:00:00Z", closed_at: null,
  imported_transaction_id: null, linked_transaction_id: null,
};
const data: CtbcInboxData = {
  candidates: [candidate], pendingCount: 1, latestRun: null,
  existing: [{ id: id(7), date: "2026-10-10", amount: 100, note: "測試既有甲", payment_method_id: id(5) }, { id: id(8), date: "2026-10-10", amount: 100, note: "測試既有乙", payment_method_id: id(6) }],
  categories: [{ id: id(3), name: "分類甲" }, { id: id(4), name: "分類乙" }],
  payments: [{ id: id(5), name: "支付甲" }, { id: id(6), name: "支付乙" }],
};
const network = vi.fn();
beforeEach(() => {
  network.mockReset().mockImplementation(async (_url: string, options: RequestInit) => {
    if (options.method === "GET") return Response.json(data);
    if (options.method === "POST") return Response.json({ results: [{ candidateId: candidate.id, status: "success" }] });
    throw new Error("unexpected synthetic request");
  });
  vi.stubGlobal("fetch", network);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const posts = () => network.mock.calls.filter(([, options]) => options.method === "POST");
async function prepareBatch() {
  const user = userEvent.setup();
  render(<CtbcInboxClient />);
  const row = await screen.findByRole("article", { name: "測試商家 待確認" });
  await user.click(within(row).getByRole("checkbox", { name: "加入本次安全批次" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "批次分類" }), id(3));
  await user.selectOptions(screen.getByRole("combobox", { name: "批次支付方式" }), id(5));
  const confirmation = screen.getByRole("checkbox", { name: "我確認所選 1 筆與共同分類、支付方式" });
  const submit = screen.getByRole("button", { name: "確認批次補記" });
  await user.click(confirmation);
  expect(confirmation).toBeChecked();
  expect(submit).toBeEnabled();
  return { user, row, confirmation, submit };
}

describe("CTBC confirmation regressions (MOCK_UI)", () => {
  it.each([
    { action: "import", label: "補記" }, { action: "link", label: "已記過" },
    { action: "ignore", label: "忽略" }, { action: "defer", label: "稍後處理" }, { action: "work", label: "工作支出／排除" },
  ])("preserves individually confirmed $action POST", async ({ action, label }) => {
    const { user, row } = await prepareBatch();
    const controls = within(row);
    await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 分類" }), id(3));
    await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 支付方式" }), id(5));
    await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 既有交易" }), id(7));
    await user.click(controls.getByRole("checkbox", { name: "我確認本筆處理方式" }));
    await user.click(controls.getByRole("button", { name: label }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1].body as string)).toEqual({ candidateId: candidate.id, expectedVersion: 1, action,
      categoryId: action === "import" ? id(3) : null, paymentId: action === "import" ? id(5) : null,
      linkedId: action === "link" ? id(7) : null, resolveRisk: false, actionKey: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    await waitFor(() => expect(controls.getByRole("checkbox", { name: "我確認本筆處理方式" })).not.toBeChecked());
  });
  it.each([
    { field: "批次分類", next: id(4), categoryId: id(4), paymentId: id(5) },
    { field: "批次支付方式", next: id(6), categoryId: id(3), paymentId: id(6) },
  ])("invalidates confirmed nonempty choices when $field changes; reconfirm submits new choices", async ({ field, next, categoryId, paymentId }) => {
    const { user, confirmation, submit } = await prepareBatch();
    await user.selectOptions(screen.getByRole("combobox", { name: field }), next);
    // Attempting submission before reconfirmation must not send a POST.
    await user.click(submit);
    expect(posts()).toHaveLength(0);
    expect(confirmation).not.toBeChecked();
    expect(submit).toBeDisabled();
    await user.click(confirmation);
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(posts()).toHaveLength(1));
    const body = JSON.parse(posts()[0][1].body as string);
    expect(body.commands).toHaveLength(1);
    expect(body.commands[0]).toEqual({ candidateId: candidate.id, expectedVersion: 1, action: "import", categoryId, paymentId, batch: true, actionKey: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    await waitFor(() => expect(confirmation).not.toBeChecked());
  });

  it("still clears batch confirmation on deselection and reselection", async () => {
    const { user, row, confirmation, submit } = await prepareBatch();
    const selection = within(row).getByRole("checkbox", { name: "加入本次安全批次" });
    await user.click(selection);
    expect(screen.getByRole("checkbox", { name: "我確認所選 0 筆與共同分類、支付方式" })).not.toBeChecked();
    expect(submit).toBeDisabled();
    await user.click(selection);
    expect(confirmation).not.toBeChecked();
    expect(submit).toBeDisabled();
    expect(posts()).toHaveLength(0);
  });

  it.each(["測試商家 分類", "測試商家 支付方式", "測試商家 既有交易"])("preserves individual confirmation resets for %s and all five actions", async (field) => {
    const { user, row } = await prepareBatch();
    const controls = within(row);
    await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 分類" }), id(3));
    await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 支付方式" }), id(5));
    await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 既有交易" }), id(7));
    const confirmation = controls.getByRole("checkbox", { name: "我確認本筆處理方式" });
    await user.click(confirmation);
    expect(controls.getByRole("button", { name: "補記" })).toBeEnabled();
    for (const name of ["補記", "已記過", "忽略", "稍後處理", "工作支出／排除"]) expect(controls.getByRole("button", { name })).toBeEnabled();
    await user.selectOptions(controls.getByRole("combobox", { name: field }), field.endsWith("分類") ? id(4) : field.endsWith("支付方式") ? id(6) : id(8));
    expect(confirmation).not.toBeChecked();
    for (const name of ["補記", "已記過", "忽略", "稍後處理", "工作支出／排除"]) expect(controls.getByRole("button", { name })).toBeDisabled();
    expect(posts()).toHaveLength(0);
  });
});
