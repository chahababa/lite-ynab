import { describe, expect, it } from "vitest";

import { computeBudgetSuggestions, describeBudgetSuggestion, roundUpBudget } from "./budgetSuggestion";

const tx = (date: string, category_id: string, amount: number) => ({ date, category_id, amount });

describe("roundUpBudget", () => {
  it("rounds small amounts up to the next 100 and larger ones to the next 500", () => {
    expect(roundUpBudget(0)).toBe(0);
    expect(roundUpBudget(560)).toBe(600);
    expect(roundUpBudget(1900)).toBe(1900);
    expect(roundUpBudget(2000)).toBe(2000);
    expect(roundUpBudget(5185)).toBe(5500);
    expect(roundUpBudget(30117)).toBe(30500);
  });
});

describe("computeBudgetSuggestions", () => {
  it("uses the middle month of the three before the target month, counting empty months as zero", () => {
    const result = computeBudgetSuggestions(
      [
        tx("2026-09-03", "food", 9000),
        tx("2026-09-20", "food", 5000),
        tx("2026-10-11", "food", 17000),
        // outside the window: the target month itself and an older month
        tx("2026-12-01", "food", 99999),
        tx("2026-08-31", "food", 99999),
      ],
      "2026-12",
    );

    expect(result.food).toEqual({ suggested: 14000, typical: 14000, max: 17000, activeMonths: 2, months: 3 });
  });

  it("is not skewed by one incomplete month or one unusually large month", () => {
    const result = computeBudgetSuggestions(
      [
        // 8 月記帳不完整、其餘兩個月正常
        tx("2026-08-10", "food", 4200),
        tx("2026-09-10", "food", 31508),
        tx("2026-10-10", "food", 28726),
        // 一筆機票讓 10 月暴增
        tx("2026-09-07", "travel", 5812),
        tx("2026-10-17", "travel", 91256),
      ],
      "2026-11",
    );

    expect(result.food).toMatchObject({ suggested: 29000, typical: 28726, max: 31508 });
    expect(result.travel).toMatchObject({ suggested: 6000, typical: 5812, max: 91256 });
  });

  it("gives no suggestion for a category that only had spending in one month", () => {
    const result = computeBudgetSuggestions(
      [tx("2026-10-17", "travel", 91256), tx("2026-09-01", "transit", 5296), tx("2026-10-01", "transit", 5074)],
      "2026-11",
    );

    expect(result.travel).toBeUndefined();
    expect(result.transit?.suggested).toBe(5500);
  });

  it("handles a window that crosses a year boundary", () => {
    const result = computeBudgetSuggestions(
      [tx("2026-11-05", "sub", 560), tx("2026-12-05", "sub", 560), tx("2027-01-05", "sub", 560)],
      "2027-02",
    );

    expect(result.sub).toMatchObject({ suggested: 600, typical: 560, activeMonths: 3 });
  });
});

describe("describeBudgetSuggestion", () => {
  it("explains where the number comes from", () => {
    expect(describeBudgetSuggestion({ suggested: 10500, typical: 10333, max: 17000, activeMonths: 2, months: 3 })).toBe(
      "近 3 個月通常花 $10,333，最高 $17,000",
    );
  });
});
