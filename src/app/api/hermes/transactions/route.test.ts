import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    createClient: vi.fn(),
    insert: vi.fn(),
    duplicateMaybeSingle: vi.fn(),
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
                data: [
                  { id: "cat-breakfast", name: "早餐" },
                  { id: "cat-food", name: "飲食" },
                ],
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
                data: [{ id: "pm-cash", name: "現金" }],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: mocks.duplicateMaybeSingle,
              }),
            }),
          }),
          insert: mocks.insert,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("POST /api/hermes/transactions", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.insert.mockReset();
    mocks.duplicateMaybeSingle.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.HERMES_WEBHOOK_SECRET = "secret";
    process.env.LITEYNAB_USER_ID = "user-1";
    mocks.createClient.mockReturnValue(createMockSupabase());
    mocks.duplicateMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.insert.mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "tx-1" }, error: null }),
      }),
    });
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
});
