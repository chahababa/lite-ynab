import { describe, expect, it } from "vitest";

import { matchAutoRule, normalizeMerchant, pickAutoImports, type CtbcAutoRule } from "./ctbcAutoRules";
import type { CtbcCandidate } from "./ctbcInbox";

const rule = (id: string, pattern: string, max_amount: number | null = 1000, enabled = true): CtbcAutoRule => ({
  id,
  pattern,
  action: "import",
  category_id: `cat-${id}`,
  max_amount,
  enabled,
});

const candidate = (overrides: Partial<CtbcCandidate> = {}): CtbcCandidate => ({
  id: "c1",
  batch_id: "b1",
  occurred_at: "2026-11-22T04:00:00Z",
  amount: 265,
  merchant: "５５６８８ＡＰＰ",
  product: null,
  card_role: "primary",
  bank_category: "交通汽修/停車",
  suggested_payment_id: "pay-1",
  warnings: [],
  late: false,
  status: "needs_review",
  version: 1,
  created_at: "2026-11-23T09:00:00Z",
  closed_at: null,
  imported_transaction_id: null,
  linked_transaction_id: null,
  ...overrides,
});

describe("normalizeMerchant", () => {
  it("folds full-width characters, case and spaces", () => {
    expect(normalizeMerchant("５５６８８ＡＰＰ")).toBe("55688app");
    expect(normalizeMerchant("優步 Ｌｉｔｔｌｅ ｎ")).toBe("優步littlen");
    expect(normalizeMerchant("NETFLIX.COM")).toBe("netflix.com");
  });
});

describe("matchAutoRule", () => {
  const rules = [rule("taxi", "55688"), rule("uber-eats", "優步"), rule("uber-ride", "優步福爾摩沙"), rule("nf", "netflix", null)];

  it("matches full-width merchant names against half-width patterns", () => {
    expect(matchAutoRule(rules, "５５６８８ＡＰＰ", 265)?.id).toBe("taxi");
    expect(matchAutoRule(rules, "NETFLIX.COM", 560)?.id).toBe("nf");
  });

  it("prefers the most specific pattern", () => {
    expect(matchAutoRule(rules, "優步福爾摩沙股份有限公司", 329)?.id).toBe("uber-ride");
    expect(matchAutoRule(rules, "優步 鴨炸東山鴨頭 中", 415)?.id).toBe("uber-eats");
  });

  it("does not auto-record above the amount limit, and has no limit when none is set", () => {
    expect(matchAutoRule(rules, "５５６８８ＡＰＰ", 1001)).toBeNull();
    expect(matchAutoRule(rules, "５５６８８ＡＰＰ", 1000)?.id).toBe("taxi");
    expect(matchAutoRule(rules, "NETFLIX.COM", 99999)?.id).toBe("nf");
  });

  it("does not fall back to a broader rule when the most specific one is disabled or over its limit", () => {
    const withDisabled = [rule("uber-eats", "優步"), rule("uber-ride", "優步福爾摩沙", 1000, false)];
    expect(matchAutoRule(withDisabled, "優步福爾摩沙股份有限公司", 329)).toBeNull();

    const withLimit = [rule("uber-eats", "優步", null), rule("uber-ride", "優步福爾摩沙", 500)];
    expect(matchAutoRule(withLimit, "優步福爾摩沙股份有限公司", 800)).toBeNull();
  });

  it("never matches without a merchant name or an amount", () => {
    expect(matchAutoRule(rules, null, 265)).toBeNull();
    expect(matchAutoRule(rules, "５５６８８ＡＰＰ", null)).toBeNull();
    expect(matchAutoRule(rules, "全家便利商店 板橋松翠店", 80)).toBeNull();
  });
});

describe("pickAutoImports", () => {
  const rules = [rule("taxi", "55688")];

  it("picks clean pending candidates that match a rule", () => {
    const picked = pickAutoImports([candidate()], rules);
    expect(picked).toHaveLength(1);
    expect(picked[0].rule.id).toBe("taxi");
  });

  it("leaves anything with a warning, a closed status or missing details for manual review", () => {
    const skipped = [
      candidate({ id: "dup", warnings: ["possible_duplicate"] }),
      candidate({ id: "conflict", status: "conflict" }),
      candidate({ id: "done", status: "imported" }),
      candidate({ id: "nopay", suggested_payment_id: null }),
      candidate({ id: "nodate", occurred_at: null }),
      candidate({ id: "noname", merchant: null }),
      candidate({ id: "other", merchant: "蝦皮 heavenbu" }),
    ];
    expect(pickAutoImports(skipped, rules)).toEqual([]);
  });
});
