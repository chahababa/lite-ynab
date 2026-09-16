import { describe, expect, it, vi } from "vitest";
import { fetchDailyTransactionBackupInput } from "./dailyTransactionBackupServer";

const tables = ["transactions", "categories", "category_groups", "payment_methods"];

function source(options: { rows?: number; cap?: number; failTable?: string; badCount?: boolean; drift?: boolean; emptyPage?: boolean; duplicate?: boolean } = {}) {
  const queries: Array<{ table: string; query: ReturnType<typeof createQuery> }> = [];
  function createQuery(table: string) {
    const query = {
      select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
      range: vi.fn(async (from: number, to: number) => {
        const count = options.rows ?? 3;
        return {
          data: options.emptyPage && from > 0 ? [] : Array.from({ length: Math.min(to - from + 1, options.cap ?? 2, Math.max(0, count - from)) }, (_, i) => ({ id: `id-${options.duplicate ? 0 : from + i}` })),
          count: options.badCount ? null : count + (options.drift && from > 0 ? 1 : 0),
          error: options.failTable === table ? { message: "private provider error" } : null,
        };
      }),
    };
    return query;
  }
  const from = vi.fn((table: string) => { const query = createQuery(table); queries.push({ table, query }); return query; });
  return { client: { from } as never, from, queries };
}

describe("daily backup source", () => {
  it.each(["", "  ", undefined])("rejects tenant %s before constructing or using a service client", async (userId) => {
    const mock = source();
    await expect(fetchDailyTransactionBackupInput({ userId: userId as string, supabase: mock.client })).rejects.toThrow("explicit tenant scope");
    expect(mock.from).not.toHaveBeenCalled();
    await expect(fetchDailyTransactionBackupInput({ userId: userId as string })).rejects.toThrow("explicit tenant scope");
  });

  it("paginates every table despite a smaller server cap, with trusted scope on every page", async () => {
    const mock = source();
    const result = await fetchDailyTransactionBackupInput({ userId: " tenant-1 ", supabase: mock.client });
    for (const rows of Object.values(result)) expect(rows.map((row) => row.id)).toEqual(["id-0", "id-1", "id-2"]);
    for (const table of tables) {
      const queries = mock.queries.filter((q) => q.table === table);
      expect(queries).toHaveLength(2);
      expect(queries[0].query.range).toHaveBeenCalledWith(0, 999);
      expect(queries[1].query.range).toHaveBeenCalledWith(2, 1001);
      for (const { query } of queries) {
        expect(query.eq).toHaveBeenCalledWith("user_id", "tenant-1");
        expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
        expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining("user_id"), { count: "exact" });
      }
    }
  });

  it.each([0, 1000, 1001, 2000])("reads %s rows without truncation or an extra empty-page request", async (rows) => {
    const mock = source({ rows, cap: 1000 });
    const result = await fetchDailyTransactionBackupInput({ userId: "tenant-1", supabase: mock.client });
    expect(result.transactions).toHaveLength(rows);
    expect(mock.from).toHaveBeenCalledTimes(4 * Math.max(1, Math.ceil(rows / 1000)));
  });

  it.each(tables)("fails closed on a %s read error", async (failTable) => {
    const mock = source({ failTable });
    await expect(fetchDailyTransactionBackupInput({ userId: "tenant-1", supabase: mock.client })).rejects.toThrow("source read failed");
  });

  it.each([{ badCount: true }, { drift: true }, { emptyPage: true }, { duplicate: true }])("rejects incomplete/unstable pagination %j", async (options) => {
    const mock = source(options);
    await expect(fetchDailyTransactionBackupInput({ userId: "tenant-1", supabase: mock.client })).rejects.toThrow();
  });
});
