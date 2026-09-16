import { describe, expect, it, vi } from "vitest";

import { fetchMonthlyExpenseReport } from "./monthlyExpenseReportServer";

function createQuery(result: { data: unknown[]; error: null }) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    in: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

describe("fetchMonthlyExpenseReport", () => {
  it("requires an explicit tenant before creating a service-role client", async () => {
    const from = vi.fn();
    const supabase = { from };

    await expect(fetchMonthlyExpenseReport({ supabase: supabase as never, monthId: "2026-04", userId: " " })).rejects.toThrow(
      "Monthly report requires explicit tenant scope",
    );

    expect(from).not.toHaveBeenCalled();
  });

  it("scopes every report read to the explicit tenant", async () => {
    const queries = Array.from({ length: 7 }, () => createQuery({ data: [], error: null }));
    const from = vi.fn((() => queries[from.mock.calls.length - 1]) as () => (typeof queries)[number]);
    const supabase = { from };

    await fetchMonthlyExpenseReport({ supabase: supabase as never, monthId: "2026-04", userId: "trusted-user" });

    expect(from).toHaveBeenCalledTimes(7);
    for (const query of queries) {
      expect(query.eq).toHaveBeenCalledWith("user_id", "trusted-user");
    }
  });
});
