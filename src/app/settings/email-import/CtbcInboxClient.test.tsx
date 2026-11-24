// @vitest-environment jsdom
// MOCK_UI: actual component, synthetic session/network only; no authenticated DB/browser E2E.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CtbcCandidate, CtbcInboxData } from "@/lib/ctbcInbox";

import { CtbcInboxClient } from "./CtbcInboxClient";

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "synthetic-session" } } }) } }),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const candidate = (n: number, merchant: string, amount: number, extra: Partial<CtbcCandidate> = {}): CtbcCandidate => ({
  id: id(n), batch_id: id(2), occurred_at: "2026-10-10T04:00:00Z", amount, merchant,
  product: null, card_role: "primary", bank_category: null, suggested_payment_id: id(5), warnings: [], late: false,
  status: "needs_review", version: 1, created_at: "2026-10-10T04:00:00Z", closed_at: null,
  imported_transaction_id: null, linked_transaction_id: null, ...extra,
});
const baseData = (): CtbcInboxData => ({
  candidates: [candidate(11, "已記商家", 100), candidate(12, "未記商家", 250)],
  pendingCount: 2,
  latestRun: null,
  existing: [{ id: id(7), date: "2026-10-10", amount: 100, note: "午餐", payment_method_id: id(5), category_id: id(3) }],
  categories: [
    { id: id(3), name: "個人-飲食🟩", groupName: "個人" },
    { id: id(4), name: "家庭-日常花費🟢", groupName: "家庭" },
  ],
  payments: [{ id: id(5), name: "中信卡" }, { id: id(6), name: "現金" }],
});

let data: CtbcInboxData;
const network = vi.fn();
beforeEach(() => {
  data = baseData();
  network.mockReset().mockImplementation(async (_url: string, options: RequestInit) => {
    if (options.method === "GET") return Response.json(data);
    if (options.method === "POST") return Response.json({ code: "ok" });
    throw new Error("unexpected synthetic request");
  });
  vi.stubGlobal("fetch", network);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const posts = () => network.mock.calls.filter(([, options]) => options.method === "POST").map(([, options]) => JSON.parse(options.body as string));
async function open() {
  const user = userEvent.setup();
  render(<CtbcInboxClient />);
  await screen.findByRole("heading", { name: "刷卡待確認（2）" });
  return user;
}

describe("CtbcInboxClient", () => {
  it("同一天同金額的刷卡歸到「看起來已經記過」，其餘留在「還沒記的」", async () => {
    await open();
    const recorded = screen.getByRole("region", { name: "看起來已經記過" });
    expect(within(recorded).getByText("已記商家")).toBeInTheDocument();
    expect(within(recorded).getByText("你記的：10/10 · 飲食 · 午餐")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "還沒記的（1）" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "未記商家 待確認" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "已記商家 待確認" })).not.toBeInTheDocument();
  });

  it("「全部標為已記過」逐筆連結到對應的帳本交易", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "全部標為已記過（1）" }));
    await screen.findByText("已標為已記過 1 筆");
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toMatchObject({ candidateId: id(11), expectedVersion: 1, action: "link", linkedId: id(7), resolveRisk: true, categoryId: null, paymentId: null });
    expect(posts()[0].actionKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("點「不是」會把那筆移回還沒記的，不送出任何操作", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "已記商家 不是同一筆" }));
    expect(screen.queryByRole("region", { name: "看起來已經記過" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "已記商家 待確認" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "還沒記的（2）" })).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("點分類就補記，支付方式預設用收信時判斷的那張卡", async () => {
    const user = await open();
    expect(screen.getByRole("combobox", { name: "支付方式" })).toHaveValue(id(5));
    const card = screen.getByRole("article", { name: "未記商家 待確認" });
    expect(within(card).getByRole("button", { name: "未記商家 記到 家庭-日常花費🟢" })).toHaveTextContent("日常花費");
    await user.click(within(card).getByRole("button", { name: "未記商家 記到 個人-飲食🟩" }));
    await screen.findByText(/已補記：未記商家 → 飲食/);
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toMatchObject({ candidateId: id(12), action: "import", categoryId: id(3), paymentId: id(5), linkedId: null, resolveRisk: true });
  });

  it("改選支付方式後，補記用新選的那個", async () => {
    const user = await open();
    await user.selectOptions(screen.getByRole("combobox", { name: "支付方式" }), id(6));
    await user.click(screen.getByRole("button", { name: "未記商家 記到 個人-飲食🟩" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({ paymentId: id(6) });
  });

  it("沒有可用的支付方式時不能補記", async () => {
    data.candidates = data.candidates.map((c) => ({ ...c, suggested_payment_id: null }));
    await open();
    expect(screen.getByText("請先在右上選這張卡對應的支付方式，才能補記。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "未記商家 記到 個人-飲食🟩" })).toBeDisabled();
  });

  it("伺服器補記前重新檢查而擋下（409）時，用新版本自動再送一次", async () => {
    let importAttempts = 0;
    network.mockImplementation(async (_url: string, options: RequestInit) => {
      if (options.method === "GET") return Response.json(data);
      importAttempts += 1;
      if (importAttempts === 1) {
        data = { ...data, candidates: data.candidates.map((c) => (c.id === id(12) ? { ...c, version: 2, status: "conflict", warnings: ["possible_duplicate"] } : c)) };
        return Response.json({ error: "action_conflict" }, { status: 409 });
      }
      return Response.json({ code: "personal_imported" });
    });
    const user = await open();
    await user.click(screen.getByRole("button", { name: "未記商家 記到 個人-飲食🟩" }));
    await screen.findByText(/已補記：未記商家/);
    expect(posts().map((p) => p.expectedVersion)).toEqual([1, 2]);
    expect(posts()[0].actionKey).not.toBe(posts()[1].actionKey);
  });

  it("409 之後資料沒有變就不重送，顯示錯誤", async () => {
    network.mockImplementation(async (_url: string, options: RequestInit) =>
      options.method === "GET" ? Response.json(data) : Response.json({ error: "action_conflict" }, { status: 409 }));
    const user = await open();
    await user.click(screen.getByRole("button", { name: "未記商家 記到 個人-飲食🟩" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("資料剛剛有變動");
    expect(posts()).toHaveLength(1);
  });

  it("忽略要點兩下才會送出", async () => {
    const user = await open();
    const card = screen.getByRole("article", { name: "未記商家 待確認" });
    await user.click(within(card).getByRole("button", { name: "忽略" }));
    expect(posts()).toHaveLength(0);
    await user.click(within(card).getByRole("button", { name: "確定忽略" }));
    await screen.findByText("已忽略：未記商家");
    expect(posts()[0]).toMatchObject({ candidateId: id(12), action: "ignore", categoryId: null, paymentId: null, linkedId: null });
  });

  it("工作支出要點兩下才會送出", async () => {
    const user = await open();
    const card = screen.getByRole("article", { name: "未記商家 待確認" });
    await user.click(within(card).getByRole("button", { name: "工作支出" }));
    await user.click(within(card).getByRole("button", { name: "確定是工作支出" }));
    await screen.findByText("已排除（工作支出）：未記商家");
    expect(posts()[0]).toMatchObject({ action: "work" });
  });

  it("隔一天有同金額紀錄時只提醒，可以一鍵標成同一筆", async () => {
    data.existing.push({ id: id(8), date: "2026-10-11", amount: 250, note: "隔天補記", payment_method_id: id(5), category_id: id(4) });
    const user = await open();
    const card = screen.getByRole("article", { name: "未記商家 待確認" });
    expect(within(card).getByText("隔一天有同金額的紀錄：10/11 · 日常花費 · 隔天補記")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "未記商家 是同一筆" }));
    await screen.findByText("已標為已記過：未記商家");
    expect(posts()[0]).toMatchObject({ action: "link", linkedId: id(8) });
  });

  it("手動「已記過」可以從前後一天的交易挑一筆", async () => {
    data.existing.push({ id: id(9), date: "2026-10-09", amount: 999, note: "別筆", payment_method_id: id(5), category_id: null });
    const user = await open();
    const card = screen.getByRole("article", { name: "未記商家 待確認" });
    await user.click(within(card).getByRole("button", { name: "已記過" }));
    await user.selectOptions(within(card).getByRole("combobox", { name: "未記商家 既有交易" }), id(9));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({ action: "link", linkedId: id(9) });
  });

  it("通知內容衝突的刷卡不能補記，但仍可忽略", async () => {
    data.candidates[1] = { ...data.candidates[1], status: "conflict", warnings: ["source_payload_conflict"] };
    await open();
    const card = screen.getByRole("article", { name: "未記商家 待確認" });
    expect(within(card).getByText("通知內容前後不一致，暫時不能補記")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "未記商家 記到 個人-飲食🟩" })).toBeDisabled();
    expect(within(card).getByRole("button", { name: "忽略" })).toBeEnabled();
  });

  it("處理中時連點不會重複送出", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    network.mockImplementation(async (_url: string, options: RequestInit) => {
      if (options.method === "GET") return Response.json(data);
      await gate;
      return Response.json({ code: "ok" });
    });
    const user = await open();
    const button = screen.getByRole("button", { name: "未記商家 記到 個人-飲食🟩" });
    await user.click(button);
    await user.click(button);
    release();
    await screen.findByText(/已補記：未記商家/);
    expect(posts()).toHaveLength(1);
  });

  it("沒有登入或讀取失敗時顯示錯誤", async () => {
    network.mockImplementation(async () => Response.json({ error: "unauthorized" }, { status: 401 }));
    render(<CtbcInboxClient />);
    expect(await screen.findByRole("alert")).toHaveTextContent("請重新登入");
  });

  it("處理過的刷卡收在「最近處理過的」", async () => {
    data.candidates.push(candidate(13, "舊商家", 80, { status: "imported", imported_transaction_id: id(20) }));
    await open();
    expect(screen.getByText("最近處理過的（1）")).toBeInTheDocument();
    expect(screen.getByText(/\$80 · 已補記/)).toBeInTheDocument();
  });
});
