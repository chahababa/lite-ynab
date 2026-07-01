import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

describe("GET /api/cron/monthly-budget-reset", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.rpc.mockReset();
    mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    process.env.CRON_SECRET = "secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("rejects invalid monthId before calling Supabase", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://lite-ynab.test/api/cron/monthly-budget-reset?monthId=2026-13", {
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid monthId: 2026-13" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
