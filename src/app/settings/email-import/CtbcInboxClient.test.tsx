// @vitest-environment jsdom
// MOCK_UI: actual component, synthetic session/network only; no authenticated DB/browser E2E.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const gets = () => network.mock.calls.filter(([, options]) => options.method === "GET");
async function settleRefresh(pending: ReturnType<typeof deferredResponse>, fresh: CtbcInboxData) {
  await act(async () => { pending.resolve(Response.json(fresh)); });
}

describe("CTBC reload snapshot regressions (MOCK_UI)", () => {
  it.each([1, 2])("requires a fresh acknowledgement after same-ID reload at version %s", async (version) => {
    const { user, confirmation, submit } = await prepareBatch();
    const pending = deferredResponse();
    network.mockImplementationOnce(() => pending.promise);
    await user.click(screen.getByRole("button", { name: "重新載入待辦" }));
    await waitFor(() => expect(gets()).toHaveLength(2));
    await settleRefresh(pending, { ...data, candidates: [{ ...candidate, version }] });
    expect(confirmation).not.toBeChecked();
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(posts()).toHaveLength(0);
    await user.click(confirmation);
    await user.click(submit);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1].body as string).commands[0]).toMatchObject({ candidateId: candidate.id, expectedVersion: version, categoryId: id(3), paymentId: id(5) });
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(confirmation).not.toBeChecked();
  });

  it.each(["reduced", "empty", "risky"])("cancels acknowledgement when reload filters %s selection", async (scenario) => {
    const second = { ...candidate, id: id(9), merchant: "測試第二筆" };
    network.mockImplementationOnce(async () => Response.json({ ...data, candidates: [candidate, second], pendingCount: 2 }));
    const { user, confirmation, submit } = await prepareBatch();
    await user.click(within(screen.getByRole("article", { name: "測試第二筆 待確認" })).getByRole("checkbox", { name: "加入本次安全批次" }));
    await user.click(screen.getByRole("checkbox", { name: "我確認所選 2 筆與共同分類、支付方式" }));
    const pending = deferredResponse();
    network.mockImplementationOnce(() => pending.promise);
    await user.click(screen.getByRole("button", { name: "重新載入待辦" }));
    const candidates = scenario === "empty" ? [] : scenario === "risky" ? [{ ...candidate, warnings: ["source_payload_conflict"] }] : [candidate];
    await settleRefresh(pending, { ...data, candidates, pendingCount: candidates.length });
    const count = scenario === "reduced" ? 1 : 0;
    expect(screen.getByRole("checkbox", { name: `我確認所選 ${count} 筆與共同分類、支付方式` })).not.toBeChecked();
    expect(submit).toBeDisabled();
    expect(posts()).toHaveLength(0);
    if (count) {
      await user.click(confirmation);
      await user.click(submit);
      await waitFor(() => expect(posts()).toHaveLength(1));
      expect(JSON.parse(posts()[0][1].body as string).commands.map((c: { candidateId: string }) => c.candidateId)).toEqual([candidate.id]);
      await waitFor(() => expect(submit).toBeDisabled());
    }
  });

  it("blocks in-flight reticks, repeated refresh and both action paths without duplicate GET/POST", async () => {
    const { user, row, confirmation, submit } = await prepareBatch();
    const controls = within(row);
    await user.click(controls.getByRole("checkbox", { name: "我確認本筆處理方式" }));
    const perRow = controls.getByRole("button", { name: "忽略" });
    const refresh = screen.getByRole("button", { name: "重新載入待辦" });
    const pending = deferredResponse();
    network.mockImplementationOnce(() => pending.promise);
    // Same-turn clicks exercise ref guards before React can commit disabled controls.
    act(() => { refresh.click(); refresh.click(); submit.click(); perRow.click(); });
    await waitFor(() => expect(gets()).toHaveLength(2));
    expect(posts()).toHaveLength(0);
    expect(refresh).toBeDisabled();
    expect(confirmation).not.toBeChecked();
    expect(confirmation).toBeDisabled();
    expect(perRow).toBeDisabled();
    await user.click(confirmation);
    fireEvent.click(confirmation);
    await user.click(submit);
    await user.click(perRow);
    await user.click(refresh);
    expect(gets()).toHaveLength(2);
    expect(posts()).toHaveLength(0);
    await settleRefresh(pending, { ...data, candidates: [{ ...candidate, version: 2 }] });
    expect(refresh).toBeEnabled();
    expect(confirmation).toBeEnabled();
    expect(confirmation).not.toBeChecked();
    expect(submit).toBeDisabled();
    await user.click(confirmation);
    await user.click(submit);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1].body as string).commands[0].expectedVersion).toBe(2);
    await waitFor(() => expect(refresh).toBeEnabled());
  });

  it.each(["network", "http"])("failed %s reload leaves acknowledgement cancelled, error visible and controls recoverable", async (failure) => {
    const { user, confirmation, submit } = await prepareBatch();
    const refresh = screen.getByRole("button", { name: "重新載入待辦" });
    const pending = deferredResponse();
    network.mockImplementationOnce(() => pending.promise);
    await user.click(refresh);
    await act(async () => {
      if (failure === "network") pending.reject(new Error("synthetic refresh failed"));
      else pending.resolve(Response.json({}, { status: 500 }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(failure === "network" ? "synthetic refresh failed" : "目前無法確認處理結果");
    expect(refresh).toBeEnabled();
    expect(confirmation).toBeEnabled();
    expect(confirmation).not.toBeChecked();
    expect(submit).toBeDisabled();
    expect(posts()).toHaveLength(0);
    await user.click(refresh);
    await waitFor(() => expect(refresh).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(confirmation).not.toBeChecked();
    await user.click(confirmation);
    await user.click(submit);
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(refresh).toBeEnabled());
  });

  it.each(["batch", "row"])("%s internal reload clears old batch acknowledgement without deadlock or early unlock", async (path) => {
    const { user, row, confirmation, submit } = await prepareBatch();
    const refresh = screen.getByRole("button", { name: "重新載入待辦" });
    const pending = deferredResponse();
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "GET" ? pending.promise : Response.json({ results: [{ status: "success" }] }));
    if (path === "batch") await user.click(submit);
    else {
      await user.click(within(row).getByRole("checkbox", { name: "我確認本筆處理方式" }));
      await user.click(within(row).getByRole("button", { name: "忽略" }));
    }
    await waitFor(() => expect(gets()).toHaveLength(2));
    expect(confirmation).not.toBeChecked();
    expect(refresh).toBeDisabled();
    await user.click(refresh);
    await user.click(submit);
    expect(posts()).toHaveLength(1);
    expect(gets()).toHaveLength(2);
    await settleRefresh(pending, data);
    await waitFor(() => expect(refresh).toBeEnabled());
    expect(confirmation).not.toBeChecked();
    expect(submit).toBeDisabled();
  });

  it.each(["batch", "row"])("uncertain %s retry after failed POST/reload preserves exact command actionKey", async (path) => {
    const { user, row, confirmation, submit } = await prepareBatch();
    const controls = within(row);
    const pending = deferredResponse();
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "POST" ? Response.json({}, { status: 500 }) : pending.promise);
    const send = async () => {
      if (path === "batch") { await user.click(confirmation); await user.click(submit); }
      else { await user.click(controls.getByRole("checkbox", { name: "我確認本筆處理方式" })); await user.click(controls.getByRole("button", { name: "忽略" })); }
    };
    // prepareBatch has already checked batch acknowledgement.
    if (path === "batch") await user.click(submit); else await send();
    await waitFor(() => expect(gets()).toHaveLength(2));
    await act(async () => { pending.reject(new Error("synthetic GET failure")); });
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(screen.getByRole("alert")).toHaveTextContent("目前無法確認處理結果");
    expect(confirmation).not.toBeChecked();
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "GET" ? Response.json(data) : Response.json({ results: [{ status: "success" }] }));
    await user.click(screen.getByRole("button", { name: "重新載入待辦" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    await send();
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(JSON.parse(posts()[1][1].body as string)).toEqual(JSON.parse(posts()[0][1].body as string));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
  });
});

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
