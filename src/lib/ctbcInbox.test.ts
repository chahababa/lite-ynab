import { describe, expect, it } from "vitest";

import { ctbcMatchRecorded, ctbcTaipeiDate, ctbcTopCategories, type CtbcCandidate, type CtbcExisting } from "@/lib/ctbcInbox";

const cand = (id: string, occurred_at: string, amount: number, extra: Partial<CtbcCandidate> = {}): CtbcCandidate => ({
  id, batch_id: "b", occurred_at, amount, merchant: id, product: null, card_role: null, bank_category: null,
  suggested_payment_id: null, warnings: [], late: false, status: "needs_review", version: 1, created_at: occurred_at,
  closed_at: null, imported_transaction_id: null, linked_transaction_id: null, ...extra,
});
const tx = (id: string, date: string, amount: number, category_id: string | null = null): CtbcExisting => ({
  id, date, amount, note: "", payment_method_id: "p", category_id,
});

describe("ctbcTaipeiDate", () => {
  it("用台北時區換算日期", () => {
    expect(ctbcTaipeiDate("2026-11-22T17:30:00Z")).toBe("2026-11-23");
    expect(ctbcTaipeiDate("2026-11-23T15:59:00Z")).toBe("2026-11-23");
  });
});

describe("ctbcMatchRecorded", () => {
  it("同一天同金額視為已記過", () => {
    const m = ctbcMatchRecorded([cand("a", "2026-11-23T04:00:00Z", 203)], [tx("t1", "2026-11-23", 203)]);
    expect(m.recorded.get("a")?.id).toBe("t1");
    expect(m.nearby.size).toBe(0);
  });

  it("金額不同或不同天不算已記過；隔一天同金額只列為提醒", () => {
    const m = ctbcMatchRecorded(
      [cand("a", "2026-11-23T04:00:00Z", 203), cand("b", "2026-11-23T04:00:00Z", 516)],
      [tx("t1", "2026-11-23", 204), tx("t2", "2026-11-24", 516), tx("t3", "2026-11-26", 203)],
    );
    expect(m.recorded.size).toBe(0);
    expect(m.nearby.get("b")?.id).toBe("t2");
    expect(m.nearby.has("a")).toBe(false);
  });

  it("同一天刷兩次同金額、只記一次時，只有一筆算已記過", () => {
    const m = ctbcMatchRecorded(
      [cand("a", "2026-11-23T04:00:00Z", 55), cand("b", "2026-11-23T08:00:00Z", 55)],
      [tx("t1", "2026-11-23", 55)],
    );
    expect([...m.recorded.keys()]).toEqual(["a"]);
  });

  it("已被其他刷卡補記或連結的交易不再拿來配對", () => {
    const m = ctbcMatchRecorded(
      [
        cand("done", "2026-11-23T04:00:00Z", 55, { status: "imported", imported_transaction_id: "t1" }),
        cand("linked", "2026-11-23T04:00:00Z", 70, { status: "already_recorded", linked_transaction_id: "t2" }),
        cand("a", "2026-11-23T08:00:00Z", 55),
        cand("b", "2026-11-23T08:00:00Z", 70),
      ],
      [tx("t1", "2026-11-23", 55), tx("t2", "2026-11-23", 70)],
    );
    expect(m.recorded.size).toBe(0);
  });
});

describe("ctbcTopCategories", () => {
  const categories = ["c1", "c2", "c3", "c4"].map((id) => ({ id, name: id, groupName: "g" }));
  it("取最常用的幾個，顯示時維持原本順序；不足時照順序補滿", () => {
    const existing = [tx("1", "d", 1, "c4"), tx("2", "d", 1, "c4"), tx("3", "d", 1, "c2")];
    expect(ctbcTopCategories(categories, existing, 2).map((c) => c.id)).toEqual(["c2", "c4"]);
    expect(ctbcTopCategories(categories, existing, 3).map((c) => c.id)).toEqual(["c1", "c2", "c4"]);
    expect(ctbcTopCategories(categories, [], 10).map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
  });
});
