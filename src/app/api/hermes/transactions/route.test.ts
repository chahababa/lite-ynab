import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    duplicateMaybeSingle: vi.fn(),
    targetMaybeSingle: vi.fn(),
    latestLimit: vi.fn(),
    updateMaybeSingle: vi.fn(),
    categoryRows: [] as Array<{ id: string; name: string; category_groups?: { name: string } | null }>,
    paymentMethodRows: [] as Array<{ id: string; name: string }>,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

function createMockSupabase() {
  return {
    from(table: string) {
      if (table === "categories") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: mocks.categoryRows,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "payment_methods") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: mocks.paymentMethodRows,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "transactions") {
        return {
          select: (selectClause?: string) => {
            if (selectClause === "id") {
              return {
                eq: () => ({
                  eq: () => ({
                    maybeSingle: mocks.duplicateMaybeSingle,
                  }),
                }),
              };
            }

            const builder = {
              eq: vi.fn(() => builder),
              order: vi.fn(() => ({
                limit: mocks.latestLimit,
              })),
              maybeSingle: mocks.targetMaybeSingle,
            };
            return builder;
          },
          insert: mocks.insert,
          update: mocks.update,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function createUpdateBuilder() {
  const builder = {
    eq: vi.fn(() => builder),
    select: vi.fn(() => ({
      maybeSingle: mocks.updateMaybeSingle,
    })),
  };
  return builder;
}

const transactionSelectRow = {
  id: "tx-1",
  user_id: "user-1",
  amount: 630,
  date: "2026-05-28",
  category_id: "cat-card",
  payment_method_id: "pm-card",
  note: "個人 日常用品",
  source: "hermes",
  source_text: "個人 日常用品 630 中信華航卡",
  source_id: "telegram:123:456",
  metadata: { hermes: { parserVersion: 1 } },
  created_at: "2026-05-28T12:00:00Z",
  categories: { id: "cat-card", name: "中信華航卡", category_groups: { name: "個人" } },
  payment_methods: { id: "pm-card", name: "中信華航卡" },
};

const correctedTransactionSelectRow = {
  ...transactionSelectRow,
  category_id: "cat-daily",
  note: "個人",
  categories: { id: "cat-daily", name: "日常用品", category_groups: { name: "家庭" } },
};

describe("POST /api/hermes/transactions", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.insert.mockReset();
    mocks.update.mockReset();
    mocks.duplicateMaybeSingle.mockReset();
    mocks.targetMaybeSingle.mockReset();
    mocks.latestLimit.mockReset();
    mocks.updateMaybeSingle.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.HERMES_WEBHOOK_SECRET = "secret";
    process.env.LITEYNAB_USER_ID = "user-1";
    mocks.createClient.mockReturnValue(createMockSupabase());
    mocks.categoryRows = [
      { id: "cat-breakfast", name: "早餐", category_groups: { name: "個人" } },
      { id: "cat-food", name: "飲食", category_groups: { name: "個人" } },
      { id: "cat-daily", name: "日常用品", category_groups: { name: "家庭" } },
      { id: "cat-card", name: "中信華航卡", category_groups: { name: "個人" } },
    ];
    mocks.paymentMethodRows = [
      { id: "pm-cash", name: "現金" },
      { id: "pm-card", name: "中信華航卡" },
    ];
    mocks.duplicateMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.targetMaybeSingle.mockResolvedValue({ data: transactionSelectRow, error: null });
    mocks.latestLimit.mockResolvedValue({ data: [transactionSelectRow], error: null });
    mocks.updateMaybeSingle.mockResolvedValue({ data: correctedTransactionSelectRow, error: null });
    mocks.insert.mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "tx-1" }, error: null }),
      }),
    });
    mocks.update.mockReturnValue(createUpdateBuilder());
  });

  it("rejects requests without the Hermes bearer secret", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://lite-ynab.test/api/hermes/transactions", {
        method: "POST",
        body: JSON.stringify({ text: "早餐 85 現金" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("parses text, writes a Hermes transaction, and returns the created id", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://lite-ynab.test/api/hermes/transactions", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({
          text: "早餐 85 現金 蛋餅",
          sourceId: "telegram:123:456",
          context: { platform: "telegram", chatId: "123", messageId: "456" },
          baseDate: "2026-05-18",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      transactionId: "tx-1",
      parsed: {
        amount: 85,
        date: "2026-05-18",
        categoryId: "cat-breakfast",
        paymentMethodId: "pm-cash",
        note: "蛋餅",
      },
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      amount: 85,
      date: "2026-05-18",
      category_id: "cat-breakfast",
      payment_method_id: "pm-cash",
      note: "蛋餅",
      source: "hermes",
      source_text: "早餐 85 現金 蛋餅",
      source_id: "telegram:123:456",
      metadata: {
        hermes: {
          parserVersion: 1,
          confidence: expect.any(Number),
          warnings: [],
          matchedCategoryName: "早餐",
          matchedPaymentMethodName: "現金",
          context: { platform: "telegram", chatId: "123", messageId: "456" },
        },
      },
    });
  });

  it("rejects ambiguous bare duplicate category names without inserting", async () => {
    mocks.categoryRows = [
      { id: "cat-home-rent", name: "房租", category_groups: { name: "家庭" } },
      { id: "cat-other-rent", name: "房租", category_groups: { name: "其他" } },
    ];
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://lite-ynab.test/api/hermes/transactions", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({ text: "房租 12000 現金", sourceId: "telegram:123:789", baseDate: "2026-05-18" }),
      }),
    );

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      error: "無法完整解析記帳文字",
      parsed: {
        amount: 12000,
        categoryId: null,
        paymentMethodId: "pm-cash",
      },
    });
    expect(payload.parsed.warnings).toContain("分類「房租」同時存在於多個大項，請指定大項（例如：家庭 房租）");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("accepts group-qualified duplicate category names", async () => {
    mocks.categoryRows = [
      { id: "cat-home-rent", name: "房租", category_groups: { name: "家庭" } },
      { id: "cat-other-rent", name: "房租", category_groups: { name: "其他" } },
    ];
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://lite-ynab.test/api/hermes/transactions", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({ text: "家庭 房租 12000 現金", sourceId: "telegram:123:790", baseDate: "2026-05-18" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      transactionId: "tx-1",
      parsed: {
        amount: 12000,
        categoryId: "cat-home-rent",
        paymentMethodId: "pm-cash",
      },
    });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ category_id: "cat-home-rent" }));
  });

  it("does not insert duplicate source ids", async () => {
    mocks.duplicateMaybeSingle.mockResolvedValue({ data: { id: "existing-tx" }, error: null });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://lite-ynab.test/api/hermes/transactions", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({ text: "早餐 85 現金", sourceId: "telegram:123:456", baseDate: "2026-05-18" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duplicate: true, transactionId: "existing-tx" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("PATCH corrects one existing Hermes transaction with guard conditions and read-back", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("https://lite-ynab.test/api/hermes/transactions", {
        method: "PATCH",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({
          target: {
            sourceId: "telegram:123:456",
            expectedAmount: 630,
            expectedCategory: "個人/中信華航卡",
            expectedPaymentMethod: "中信華航卡",
          },
          updates: { category: "日常用品", note: "個人" },
          context: { reason: "parser ambiguity" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      transactionId: "tx-1",
      before: { amount: 630, category: "個人/中信華航卡", paymentMethod: "中信華航卡" },
      after: { amount: 630, category: "家庭/日常用品", paymentMethod: "中信華航卡", note: "個人" },
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: "cat-daily",
        note: "個人",
        metadata: expect.objectContaining({ hermesCorrection: expect.any(Object) }),
      }),
    );
  });

  it("PATCH refuses when expected guards do not match the current row", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("https://lite-ynab.test/api/hermes/transactions", {
        method: "PATCH",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({
          target: { sourceId: "telegram:123:456", expectedAmount: 999 },
          updates: { category: "日常用品" },
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "目標交易與 expected 條件不符，已取消修改",
      mismatches: ["amount"],
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("PATCH requires qualified category name when the update category is duplicated", async () => {
    mocks.categoryRows = [
      { id: "cat-home-rent", name: "房租", category_groups: { name: "家庭" } },
      { id: "cat-other-rent", name: "房租", category_groups: { name: "其他" } },
    ];
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("https://lite-ynab.test/api/hermes/transactions", {
        method: "PATCH",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({
          target: { sourceId: "telegram:123:456", expectedAmount: 630 },
          updates: { category: "房租" },
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, error: "分類「房租」同時存在於多個大項，請指定大項/分類" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
