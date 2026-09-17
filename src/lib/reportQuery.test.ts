import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { fetchReportsData } from "@/lib/data";
import type { Transaction } from "@/lib/types";

const transaction = (id: string, date = "2026-06-01", category_id = "food"): Transaction => ({
  id, date, category_id, user_id: "user-1", amount: 10, payment_method_id: "cash", note: "",
  source: "manual", source_text: null, source_id: null, metadata: {},
});
type Row = { id: string; user_id: string; [key: string]: unknown };
function mockClient(transactions: Transaction[], cap = 1000, failAt?: number, duplicate = false) {
  const rows: Record<string, Row[]> = {
    category_groups: [{ id: "personal", user_id: "user-1", name: "個人", sort_order: 0 }],
    categories: [{ id: "food", user_id: "user-1", category_group_id: "personal", name: "飲食", sort_order: 0 }],
    payment_methods: [{ id: "cash", user_id: "user-1", name: "現金", sort_order: 0 }],
    monthly_incomes: [{ id: "income", user_id: "user-1", month_id: "2026-06", amount: 50000 }],
    budgets: [], transactions,
  };
  const requests: { table: string; from: number; to: number; orders: string[]; tenant?: string }[] = [];
  const rpc = vi.fn(() => { throw new Error("Unexpected write"); });
  const from = vi.fn((table: string) => {
    let selected = rows[table];
    let tenant: string | undefined;
    const orders: string[] = [];
    const query = {
      select: vi.fn((_columns: string, options: unknown) => { expect(options).toEqual({ count: "exact" }); return query; }),
      eq: (key: string, value: string) => { if (key === "user_id") tenant = value; selected = selected.filter((row) => row[key] === value); return query; },
      in: (key: string, values: string[]) => { selected = selected.filter((row) => values.includes(String(row[key]))); return query; },
      gte: (key: string, value: string) => { selected = selected.filter((row) => String(row[key]) >= value); return query; },
      lt: (key: string, value: string) => { selected = selected.filter((row) => String(row[key]) < value); return query; },
      order: (key: string) => { orders.push(key); return query; },
      range: (start: number, end: number) => {
        requests.push({ table, from: start, to: end, orders, tenant });
        const pageStart = duplicate && table === "transactions" && start > 0 ? 0 : start;
        return Promise.resolve({
          data: selected.slice(pageStart, Math.min(pageStart + cap, pageStart + end - start + 1)),
          count: selected.length,
          error: table === "transactions" && failAt !== undefined && start >= failAt ? new Error("page failed") : null,
        });
      },
    };
    return query;
  });
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: "user-1" } } }, error: null }) }, from, rpc };
  return { client: client as unknown as SupabaseClient, requests, rpc, rows };
}

describe("read-only reports", () => {
  it("reads past the API cap, scopes every page to the user, and keeps selected month totals separate from six-month trend", async () => {
    const current = Array.from({ length: 1001 }, (_, index) => transaction(`current-${index}`));
    const mock = mockClient([...current, transaction("previous", "2026-05-10"), transaction("january", "2026-01-20"), transaction("too-old", "2025-12-31"), transaction("future", "2026-07-01"), { ...transaction("other-user"), user_id: "user-2" }], 37);
    const result = await fetchReportsData(mock.client, "2026-06");
    expect(result.summary).toMatchObject({ spent: 10010, previousSpent: 10, transactionCount: 1001, income: 50000, allocated: 0 });
    expect(result.categories[0]).toMatchObject({ name: "飲食", spent: 10010, allocated: 0 });
    expect(result.categoryGroups.reduce((sum, row) => sum + row.spent, 0)).toBe(result.summary.spent);
    expect(result.trend.map((point) => [point.monthId, point.spent])).toEqual([
      ["2026-01", 10], ["2026-02", 0], ["2026-03", 0], ["2026-04", 0], ["2026-05", 10], ["2026-06", 10010],
    ]);
    expect(mock.requests.every((request) => request.tenant === "user-1")).toBe(true);
    expect(mock.requests.filter((request) => request.table === "transactions")[1]).toMatchObject({ from: 37, to: 1036, orders: ["date", "created_at", "id"] });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("retains previous-only and unknown categories/payment methods without losing totals", async () => {
    const mock = mockClient([transaction("missing", "2026-06-01", "deleted"), { ...transaction("prior", "2026-05-01"), payment_method_id: "deleted" }]);
    const result = await fetchReportsData(mock.client, "2026-06");
    expect(result.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "food", spent: 0, previousSpent: 10, deltaSpent: -10 }),
      expect.objectContaining({ id: "deleted", name: "未知分類", spent: 10 }),
    ]));
    expect(result.categoryGroups.reduce((sum, row) => sum + row.spent, 0)).toBe(10);
    expect(result.paymentMethods.find((row) => row.id === "deleted")).toMatchObject({ previousSpent: 10, deltaSpent: -10 });
  });

  it("paginates metadata, income and budget tables as well as transactions", async () => {
    const mock = mockClient([], 1);
    for (const table of ["category_groups", "categories", "payment_methods", "monthly_incomes", "budgets"]) {
      const template = mock.rows[table][0] ?? { user_id: "user-1", category_id: "food", month_id: "2026-06", allocated: 5 };
      mock.rows[table] = [0, 1, 2].map((i) => ({ ...template, id: `${table}-${i}` }));
    }
    const result = await fetchReportsData(mock.client, "2026-06");
    expect(result.summary).toMatchObject({ allocated: 15, income: 150000 });
    expect(mock.requests.filter((request) => request.from === 2)).toHaveLength(5);
  });

  it("rejects incomplete or duplicated pages instead of displaying partial totals", async () => {
    const transactions = Array.from({ length: 3 }, (_, i) => transaction(String(i)));
    await expect(fetchReportsData(mockClient(transactions, 1, 1).client, "2026-06")).rejects.toThrow("page failed");
    await expect(fetchReportsData(mockClient(transactions, 1, undefined, true).client, "2026-06")).rejects.toThrow("重新載入");
  });

  it("keeps range reports and their equally sized previous period working", async () => {
    const mock = mockClient([transaction("march", "2026-03-01"), transaction("april", "2026-04-30"), transaction("may", "2026-05-01"), transaction("june", "2026-06-30")]);
    const report = await fetchReportsData(mock.client, "2026-06", { startMonthId: "2026-05", endMonthId: "2026-06" });
    expect(report.period).toMatchObject({ mode: "range", previousStartMonthId: "2026-03", previousEndMonthId: "2026-04" });
    expect(report.summary).toMatchObject({ spent: 20, previousSpent: 20, deltaSpent: 0 });
  });
});
