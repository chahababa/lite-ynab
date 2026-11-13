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

// React 19 flushes these discrete DOM changes before a following click in jsdom.
// Retain the actual mounted button's prior onClick as a one-shot native listener,
// then dispatch a synthetic click even if the new DOM is disabled. This exercises
// the stale-render callback guard, not a replica or a browser scheduling claim.
function retainedRenderedClick(button: HTMLElement) {
  const key = Object.keys(button).find((name) => name.startsWith("__reactProps$"));
  if (!key) throw new Error("mounted React button props unavailable");
  const callback = (button as unknown as Record<string, { onClick: () => void }>)[key].onClick;
  button.addEventListener("click", callback, { once: true });
  return () => button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function prepareRow(risky = false) {
  if (risky) network.mockImplementationOnce(async () => Response.json({ ...data, candidates: [{ ...candidate, status: "conflict", warnings: ["amount_mismatch"] }] }));
  const user = userEvent.setup();
  render(<CtbcInboxClient />);
  const row = await screen.findByRole("article", { name: `測試商家 ${risky ? "需人工核對" : "待確認"}` });
  const controls = within(row);
  await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 分類" }), id(3));
  await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 支付方式" }), id(5));
  await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 既有交易" }), id(7));
  const confirmation = controls.getByRole("checkbox", { name: "我確認本筆處理方式" });
  if (risky) await user.click(controls.getByRole("checkbox", { name: "我已逐筆核對上述疑問" }));
  await user.click(confirmation);
  return { user, controls, confirmation };
}

describe("CTBC R1 per-row snapshot freshness (MOCK_UI)", () => {
  it.each(["amount", "note", "payment", "category-name", "payment-name"])("same ID/version %s change cancels both row acknowledgements; valid reconfirmation posts current reference", async (change) => {
    const { user, controls, confirmation } = await prepareRow(true);
    const resolution = controls.getByRole("checkbox", { name: "我已逐筆核對上述疑問" });
    const pending = deferredResponse();
    network.mockImplementationOnce(() => pending.promise);
    await user.click(screen.getByRole("button", { name: "重新載入待辦" }));
    expect(confirmation).not.toBeChecked();
    expect(resolution).not.toBeChecked();
    expect(confirmation).toBeDisabled();
    const fresh = { ...data, candidates: [{ ...candidate, status: "conflict", warnings: ["amount_mismatch"] }] } as CtbcInboxData;
    if (change === "category-name") fresh.categories = data.categories.map((x) => ({ ...x, name: `${x.name}更新` }));
    else if (change === "payment-name") fresh.payments = data.payments.map((x) => ({ ...x, name: `${x.name}更新` }));
    else fresh.existing = data.existing.map((x) => x.id !== id(7) ? x : { ...x, ...(change === "amount" ? { amount: 250 } : change === "note" ? { note: "新備註" } : { payment_method_id: id(6) }) });
    await settleRefresh(pending, fresh);
    expect(confirmation).not.toBeChecked();
    expect(resolution).not.toBeChecked();
    await user.click(controls.getByRole("button", { name: "已記過" }));
    expect(posts()).toHaveLength(0);
    await user.click(confirmation);
    expect(controls.getByRole("button", { name: "已記過" })).toBeDisabled();
    await user.click(resolution);
    await user.click(controls.getByRole("button", { name: "已記過" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1].body as string)).toMatchObject({ candidateId: candidate.id, expectedVersion: 1, action: "link", linkedId: id(7), resolveRisk: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(confirmation).not.toBeChecked();
  });

  it.each(["out-of-window", "missing-link", "missing-category", "missing-payment"])("%s cannot POST even after fresh acknowledgement; selecting valid current options permits POST", async (change) => {
    const { user, controls, confirmation } = await prepareRow();
    const fresh = { ...data };
    if (change === "out-of-window") fresh.existing = data.existing.map((x) => x.id === id(7) ? { ...x, date: "2026-10-05" } : x);
    if (change === "missing-link") fresh.existing = data.existing.filter((x) => x.id !== id(7));
    if (change === "missing-category") fresh.categories = data.categories.filter((x) => x.id !== id(3));
    if (change === "missing-payment") fresh.payments = data.payments.filter((x) => x.id !== id(5));
    network.mockImplementationOnce(async () => Response.json(fresh));
    await user.click(screen.getByRole("button", { name: "重新載入待辦" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    // Independently exercise membership even on the starting implementation,
    // where refresh retained the old tick: deliberately untick then reconfirm.
    if ((confirmation as HTMLInputElement).checked) await user.click(confirmation);
    await user.click(confirmation);
    const linked = change.endsWith("link") || change === "out-of-window";
    const submit = controls.getByRole("button", { name: linked ? "已記過" : "補記" });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(posts()).toHaveLength(0);
    const field = linked ? "測試商家 既有交易" : change === "missing-category" ? "測試商家 分類" : "測試商家 支付方式";
    await user.selectOptions(controls.getByRole("combobox", { name: field }), linked ? id(8) : change === "missing-category" ? id(4) : id(6));
    expect(confirmation).not.toBeChecked();
    await user.click(confirmation);
    await user.click(submit);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1].body as string)).toMatchObject(linked ? { action: "link", linkedId: id(8) } : { action: "import", categoryId: change === "missing-category" ? id(4) : id(3), paymentId: change === "missing-payment" ? id(6) : id(5) });
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
  });

  it.each(["network", "http"])("failed %s refresh cancels per-row confirmed/resolve at start and settlement", async (failure) => {
    const { user, controls, confirmation } = await prepareRow(true);
    const resolution = controls.getByRole("checkbox", { name: "我已逐筆核對上述疑問" });
    const pending = deferredResponse();
    network.mockImplementationOnce(() => pending.promise);
    await user.click(screen.getByRole("button", { name: "重新載入待辦" }));
    expect(confirmation).not.toBeChecked();
    expect(resolution).not.toBeChecked();
    fireEvent.click(confirmation); fireEvent.click(resolution);
    await act(async () => { if (failure === "network") pending.reject(new Error("synthetic row refresh failure")); else pending.resolve(Response.json({}, { status: 500 })); });
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(confirmation).toBeEnabled();
    expect(confirmation).not.toBeChecked();
    expect(resolution).not.toBeChecked();
    await user.click(controls.getByRole("button", { name: "已記過" }));
    expect(posts()).toHaveLength(0);
    await user.click(resolution); await user.click(confirmation);
    await user.click(controls.getByRole("button", { name: "已記過" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
  });

  it.each(["batch", "row"])("%s internal reload cancels a different row's confirmed/resolve before and after GET", async (path) => {
    const other = { ...candidate, id: id(9), merchant: "測試第二筆", status: "conflict", warnings: ["amount_mismatch"] } as CtbcCandidate;
    const fresh = { ...data, candidates: [candidate, other], pendingCount: 2 };
    network.mockImplementationOnce(async () => Response.json(fresh));
    const { user, row, submit } = await prepareBatch();
    const controls = within(screen.getByRole("article", { name: "測試第二筆 需人工核對" }));
    const confirmation = controls.getByRole("checkbox", { name: "我確認本筆處理方式" });
    const resolution = controls.getByRole("checkbox", { name: "我已逐筆核對上述疑問" });
    await user.click(resolution); await user.click(confirmation);
    const first = within(row);
    await user.click(first.getByRole("checkbox", { name: "我確認本筆處理方式" }));
    const pending = deferredResponse();
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "GET" ? pending.promise : Response.json({ results: [{ status: "success" }] }));
    await user.click(path === "batch" ? submit : first.getByRole("button", { name: "忽略" }));
    await waitFor(() => expect(gets()).toHaveLength(2));
    expect(confirmation).not.toBeChecked();
    expect(confirmation).toBeDisabled();
    expect(resolution).not.toBeChecked();
    await settleRefresh(pending, fresh);
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(confirmation).not.toBeChecked();
    expect(resolution).not.toBeChecked();
    expect(posts()).toHaveLength(1);
  });

  it.each(["link", "import"])("uncertain %s retry with changed same-version references preserves exact remembered payload/key after reconfirmation", async (action) => {
    const { user, controls, confirmation } = await prepareRow(true);
    const resolution = controls.getByRole("checkbox", { name: "我已逐筆核對上述疑問" });
    const submit = controls.getByRole("button", { name: action === "link" ? "已記過" : "補記" });
    const fresh = { ...data, candidates: [{ ...candidate, status: "conflict", warnings: ["amount_mismatch"] }], existing: data.existing.map((x) => ({ ...x, amount: 333, note: "重新核對" })) } as CtbcInboxData;
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "POST" ? Response.json({}, { status: 500 }) : Response.json(fresh));
    await user.click(submit);
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(posts()).toHaveLength(1);
    expect(confirmation).not.toBeChecked();
    expect(resolution).not.toBeChecked();
    await user.click(submit);
    expect(posts()).toHaveLength(1);
    const first = JSON.parse(posts()[0][1].body as string);
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "GET" ? Response.json(fresh) : Response.json({ results: [{ status: "success" }] }));
    await user.click(resolution); await user.click(confirmation); await user.click(submit);
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(JSON.parse(posts()[1][1].body as string)).toEqual(first);
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
  });

  it.each(["confirmed", "resolve"])("same-turn %s untick followed by retained rendered click callback cannot POST", async (field) => {
    const { controls } = await prepareRow(true);
    const submit = controls.getByRole("button", { name: "已記過" });
    const checkbox = controls.getByRole("checkbox", { name: field === "confirmed" ? "我確認本筆處理方式" : "我已逐筆核對上述疑問" });
    const staleClick = retainedRenderedClick(submit);
    act(() => { checkbox.click(); staleClick(); });
    await act(async () => {});
    expect(posts()).toHaveLength(0);
  });

  it.each(["category", "payment"])("missing batch %s cannot POST after explicit fresh batch reconfirmation", async (field) => {
    const { user, confirmation, submit } = await prepareBatch();
    network.mockImplementationOnce(async () => Response.json({ ...data, ...(field === "category" ? { categories: [data.categories[1]] } : { payments: [data.payments[1]] }) }));
    await user.click(screen.getByRole("button", { name: "重新載入待辦" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    await user.click(confirmation);
    expect(submit).toBeDisabled();
    await user.click(submit); expect(posts()).toHaveLength(0);
    await user.selectOptions(screen.getByRole("combobox", { name: field === "category" ? "批次分類" : "批次支付方式" }), field === "category" ? id(4) : id(6));
    await user.click(confirmation); await user.click(submit);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1].body as string).commands[0]).toMatchObject({ categoryId: field === "category" ? id(4) : id(3), paymentId: field === "payment" ? id(6) : id(5) });
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
  });

  it("changing choices after an uncertain command creates a separate key without changing the retained exact retry", async () => {
    const { user, controls, confirmation } = await prepareRow(true);
    const resolution = controls.getByRole("checkbox", { name: "我已逐筆核對上述疑問" });
    const submit = controls.getByRole("button", { name: "補記" });
    const fresh = { ...data, candidates: [{ ...candidate, status: "conflict", warnings: ["amount_mismatch"] }] } as CtbcInboxData;
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "POST" ? Response.json({}, { status: 500 }) : Response.json(fresh));
    await user.click(submit);
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    const first = JSON.parse(posts()[0][1].body as string);
    await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 分類" }), id(4));
    await user.click(resolution); await user.click(confirmation); await user.click(submit);
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(posts()).toHaveLength(2);
    const changed = JSON.parse(posts()[1][1].body as string);
    expect(changed).toEqual({ ...first, categoryId: id(4), actionKey: expect.any(String) });
    expect(changed.actionKey).not.toBe(first.actionKey);
    await user.selectOptions(controls.getByRole("combobox", { name: "測試商家 分類" }), id(3));
    await user.click(resolution); await user.click(confirmation); await user.click(submit);
    await waitFor(() => expect(posts()).toHaveLength(3));
    expect(JSON.parse(posts()[2][1].body as string)).toEqual(first);
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
  });

  it.each(["row", "batch"])("%s action-first same-turn duplicate/cross-submit is single flight through POST and internal GET", async (path) => {
    const { user, row, confirmation, submit } = await prepareBatch();
    const controls = within(row);
    const rowConfirmation = controls.getByRole("checkbox", { name: "我確認本筆處理方式" });
    await user.click(rowConfirmation);
    const rowSubmit = controls.getByRole("button", { name: "忽略" });
    const post = deferredResponse(), get = deferredResponse();
    network.mockImplementation((_url: string, options: RequestInit) => options.method === "POST" ? post.promise : get.promise);
    act(() => { (path === "row" ? rowSubmit : submit).click(); rowSubmit.click(); submit.click(); });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(gets()).toHaveLength(1);
    expect(rowConfirmation).toBeDisabled(); expect(confirmation).toBeDisabled();
    fireEvent.click(rowConfirmation); fireEvent.click(confirmation);
    await act(async () => { post.resolve(Response.json({ results: [{ status: "success" }] })); });
    await waitFor(() => expect(gets()).toHaveLength(2));
    expect(rowConfirmation).not.toBeChecked(); expect(confirmation).not.toBeChecked();
    expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeDisabled();
    act(() => { rowSubmit.click(); submit.click(); }); expect(posts()).toHaveLength(1);
    await settleRefresh(get, data);
    expect(rowConfirmation).not.toBeChecked(); expect(confirmation).not.toBeChecked();
    expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled();
    expect(posts()).toHaveLength(1);
  });

  it.each(["分類", "支付方式", "既有交易"])("same-turn %s change followed by retained rendered click callback cannot POST", async (field) => {
    const { controls } = await prepareRow();
    const submit = controls.getByRole("button", { name: field === "既有交易" ? "已記過" : "補記" });
    const staleClick = retainedRenderedClick(submit);
    act(() => {
      const select = controls.getByRole("combobox", { name: `測試商家 ${field}` }) as HTMLSelectElement;
      select.value = field === "分類" ? id(4) : field === "支付方式" ? id(6) : id(8);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      staleClick();
    });
    await act(async () => {});
    expect(posts()).toHaveLength(0);
  });
});

describe("CTBC UX-S1/S2 feedback lifecycle (MOCK_UI)", () => {
  it("shows one refresh pending status with existing data; retains known success across failed manual refresh", async () => {
    const { user, row } = await prepareBatch();
    const controls = within(row);
    await user.click(controls.getByRole("checkbox", { name: "我確認本筆處理方式" }));
    await user.click(controls.getByRole("button", { name: "忽略" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("已忽略，不會補記");
    const get = deferredResponse();
    network.mockImplementationOnce(() => get.promise);
    await user.click(screen.getByRole("button", { name: "重新載入待辦" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("重新載入待辦中");
    expect(screen.getByRole("status")).not.toHaveTextContent("已忽略");
    expect(controls.getByRole("button", { name: "忽略" })).toBeDisabled();
    await act(async () => { get.reject(new Error("synthetic manual refresh failed")); });
    expect(screen.getByRole("status")).toHaveTextContent("已忽略，不會補記");
    expect(screen.getByRole("alert")).toHaveTextContent("synthetic manual refresh failed");
    expect(screen.queryByText("重新載入待辦中")).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it.each(["row", "batch"])("%s POST owns one pending status through internal GET and clears previous success only when new command begins", async (path) => {
    const { user, row, confirmation, submit } = await prepareBatch();
    const controls = within(row);
    const rowConfirmation = controls.getByRole("checkbox", { name: "我確認本筆處理方式" });
    await user.click(rowConfirmation); await user.click(controls.getByRole("button", { name: "忽略" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("已忽略，不會補記");
    const post = deferredResponse(), get = deferredResponse();
    network.mockImplementation((_url: string, options: RequestInit) => options.method === "POST" ? post.promise : get.promise);
    await user.click(path === "row" ? rowConfirmation : confirmation);
    // Merely preparing/reconfirming the next action must not clear the known result.
    expect(screen.getByRole("status")).toHaveTextContent("已忽略，不會補記");
    const action = path === "row" ? controls.getByRole("button", { name: "工作支出／排除" }) : submit;
    await user.click(action);
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("處理中");
    expect(screen.getByRole("status")).not.toHaveTextContent("已忽略");
    await user.click(action); expect(posts()).toHaveLength(2);
    await act(async () => { post.resolve(Response.json({ results: [{ status: "success" }] })); });
    await waitFor(() => expect(gets()).toHaveLength(3));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("處理中");
    expect(screen.queryByText("重新載入待辦中")).not.toBeInTheDocument();
    expect(action).toBeDisabled();
    await settleRefresh(get, data);
    expect(screen.queryByText("處理中")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(path === "row" ? "已排除，不列入個人帳本" : "本次批次：成功 1 筆");
  });

  it.each(["row", "batch"])("success A -> failed %s POST B shows only current alert; exact uncertain B retry payload/key survives", async (path) => {
    const { user, row, confirmation, submit } = await prepareBatch();
    const controls = within(row);
    const rowConfirmation = controls.getByRole("checkbox", { name: "我確認本筆處理方式" });
    await user.click(rowConfirmation); await user.click(controls.getByRole("button", { name: "忽略" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("已忽略，不會補記");
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "GET" ? Response.json(data) : Response.json({}, { status: 500 }));
    const action = path === "row" ? controls.getByRole("button", { name: "工作支出／排除" }) : submit;
    await user.click(path === "row" ? rowConfirmation : confirmation); await user.click(action);
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(posts()).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("目前無法確認處理結果");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("已忽略，不會補記")).not.toBeInTheDocument();
    const uncertain = JSON.parse(posts()[1][1].body as string);
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "GET" ? Response.json(data) : Response.json({ results: [{ status: "success" }] }));
    await user.click(path === "row" ? rowConfirmation : confirmation); await user.click(action);
    await waitFor(() => expect(posts()).toHaveLength(3));
    expect(JSON.parse(posts()[2][1].body as string)).toEqual(uncertain);
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
  });

  it.each(["row", "batch"])("known current %s POST success followed by failed GET keeps current success plus refresh error", async (path) => {
    const { user, row, submit } = await prepareBatch();
    const controls = within(row);
    network.mockImplementation(async (_url: string, options: RequestInit) => options.method === "GET" ? Response.json({}, { status: 500 }) : Response.json({ results: [{ status: "success" }] }));
    if (path === "row") { await user.click(controls.getByRole("checkbox", { name: "我確認本筆處理方式" })); await user.click(controls.getByRole("button", { name: "忽略" })); }
    else await user.click(submit);
    await waitFor(() => expect(screen.getByRole("button", { name: "重新載入待辦" })).toBeEnabled());
    expect(posts()).toHaveLength(1);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(path === "row" ? "已忽略，不會補記" : "本次批次：成功 1 筆");
    expect(screen.getByRole("alert")).toHaveTextContent("目前無法確認處理結果");
    expect(screen.queryByText("處理中")).not.toBeInTheDocument();
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
