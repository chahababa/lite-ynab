import { beforeEach, describe, expect, it, vi } from "vitest";

import { ctbcAutoImport } from "./ctbcInboxServer";

const provider = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: provider.createClient }));

const request = () => new Request("http://localhost/api/ctbc/auto", { method: "POST", headers: { authorization: "Bearer synthetic-session" } });

const candidate = (id: string, merchant: string | null, amount: number, extra: Record<string, unknown> = {}) => ({
  id, batch_id: "b", occurred_at: "2026-11-22T04:00:00Z", amount, merchant, product: null, card_role: "primary", bank_category: null,
  suggested_payment_id: "pay-1", warnings: [], late: false, status: "needs_review", version: 3, created_at: "2026-11-23T09:00:00Z",
  closed_at: null, imported_transaction_id: null, linked_transaction_id: null, ...extra,
});

function table(name: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(provider.tables[name] ?? { data: [], error: null }).then(resolve);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CTBC_INBOX_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-not-a-key");
  provider.getUser.mockResolvedValue({ data: { user: { id: "synthetic-owner" } }, error: null });
  provider.createClient.mockReturnValue({ auth: { getUser: provider.getUser }, rpc: provider.rpc, from: table });
  provider.tables = {
    ctbc_auto_rules: {
      data: [
        { id: "r-taxi", pattern: "55688", action: "import", category_id: "cat-transit", max_amount: 1000, enabled: true },
        { id: "r-nf", pattern: "NETFLIX", action: "import", category_id: "cat-netflix", max_amount: null, enabled: true },
        { id: "r-gone", pattern: "Spotify", action: "import", category_id: "cat-deleted", max_amount: null, enabled: true },
      ],
      error: null,
    },
    categories: { data: [{ id: "cat-transit", name: "個人-交通" }, { id: "cat-netflix", name: "Netflix_訂閱" }], error: null },
  };
});

describe("ctbcAutoImport (synthetic provider only)", () => {
  it("imports only clean candidates that match a rule, through the normal ctbc_act import", async () => {
    provider.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "ctbc_snapshot") {
        return {
          data: {
            candidates: [
              candidate("c-taxi", "５５６８８ＡＰＰ", 265),
              candidate("c-big-taxi", "５５６８８ＡＰＰ", 1800),
              candidate("c-dup", "５５６８８ＡＰＰ", 300, { warnings: ["possible_duplicate"], status: "conflict" }),
              candidate("c-nf", "NETFLIX.COM", 560),
              candidate("c-spotify", "Spotify", 298),
              candidate("c-shop", "蝦皮 heavenbu", 1380),
            ],
          },
          error: null,
        };
      }
      return { data: { code: "personal_imported", candidateId: args.p_id }, error: null };
    });

    const result = await ctbcAutoImport(request());

    expect(result.imported).toEqual([
      { merchant: "５５６８８ＡＰＰ", amount: 265, categoryName: "個人-交通" },
      { merchant: "NETFLIX.COM", amount: 560, categoryName: "Netflix_訂閱" },
    ]);
    const acts = provider.rpc.mock.calls.filter(([name]) => name === "ctbc_act").map(([, args]) => args);
    expect(acts).toHaveLength(2);
    expect(acts[0]).toMatchObject({ p_id: "c-taxi", p_expected: 3, p_action: "import", p_category: "cat-transit", p_payment: "pay-1", p_link: null, p_resolve: false, p_batch: false });
    expect(acts[0].p_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(acts[1]).toMatchObject({ p_id: "c-nf", p_category: "cat-netflix" });
  });

  it("marks matching charges as work without recording a transaction when the rule says so", async () => {
    provider.tables.ctbc_auto_rules = { data: [{ id: "r-taxi", pattern: "55688", action: "work", category_id: null, max_amount: null, enabled: true }], error: null };
    provider.rpc.mockImplementation(async (name: string) =>
      name === "ctbc_snapshot"
        ? { data: { candidates: [candidate("c-taxi", "５５６８８ＡＰＰ", 405)] }, error: null }
        : { data: { code: "work_expense_excluded" }, error: null });

    expect(await ctbcAutoImport(request())).toEqual({
      imported: [{ merchant: "５５６８８ＡＰＰ", amount: 405, categoryName: "工作支出", excluded: true }],
    });
    const act = provider.rpc.mock.calls.find(([name]) => name === "ctbc_act")?.[1];
    expect(act).toMatchObject({ p_id: "c-taxi", p_action: "work", p_category: null, p_payment: null });
  });

  it("leaves a candidate pending when the database refuses or asks for a risk recheck", async () => {
    provider.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "ctbc_snapshot") return { data: { candidates: [candidate("c-taxi", "55688APP", 265), candidate("c-nf", "NETFLIX.COM", 560)] }, error: null };
      if (args.p_id === "c-taxi") return { data: { code: "risk_recheck_required" }, error: null };
      return { data: null, error: { message: "stale_version" } };
    });

    expect(await ctbcAutoImport(request())).toEqual({ imported: [] });
  });

  it("does nothing, and never touches the inbox, when there are no rules or the rules table is unavailable", async () => {
    provider.tables.ctbc_auto_rules = { data: [], error: null };
    expect(await ctbcAutoImport(request())).toEqual({ imported: [] });

    provider.tables.ctbc_auto_rules = { data: null, error: { message: "relation does not exist" } };
    expect(await ctbcAutoImport(request())).toEqual({ imported: [] });

    expect(provider.rpc).not.toHaveBeenCalled();
  });

  it("rejects requests without a session", async () => {
    await expect(ctbcAutoImport(new Request("http://localhost/api/ctbc/auto", { method: "POST" }))).rejects.toThrow("unauthorized");
    expect(provider.rpc).not.toHaveBeenCalled();
  });
});
