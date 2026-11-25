import { describe, expect, it } from "vitest";

import { computeDailyAllowance, describeSpendingReminder } from "./dailyAllowance";

describe("computeDailyAllowance", () => {
  it("spreads what is left before today across the remaining days, today included", () => {
    // 11 月有 30 天，21 號起含當天還有 10 天；今天以前剩 15000 - 12000 = 3000
    expect(computeDailyAllowance({ available: 15000, spent: 12000, spentToday: 0 }, "2026-11", "2026-11-21")).toEqual({
      daysLeft: 10,
      perDay: 300,
      todayLeft: 300,
    });
  });

  it("subtracts what was already spent today without shrinking today's own allowance", () => {
    expect(
      computeDailyAllowance({ available: 15000, spent: 12200, spentToday: 200 }, "2026-11", "2026-11-21"),
    ).toEqual({ daysLeft: 10, perDay: 300, todayLeft: 100 });
  });

  it("goes negative when today is over its share but the month still has budget", () => {
    expect(
      computeDailyAllowance({ available: 15000, spent: 12500, spentToday: 500 }, "2026-11", "2026-11-21"),
    ).toMatchObject({ perDay: 300, todayLeft: -200 });
  });

  it("gives the whole remainder on the last day of the month", () => {
    expect(computeDailyAllowance({ available: 1000, spent: 400 }, "2026-02", "2026-02-28")).toEqual({
      daysLeft: 1,
      perDay: 600,
      todayLeft: 600,
    });
  });

  it("returns null without a budget, for another month, or once the month is overspent", () => {
    expect(computeDailyAllowance(undefined, "2026-11", "2026-11-21")).toBeNull();
    expect(computeDailyAllowance({ available: 0, spent: 300 }, "2026-11", "2026-11-21")).toBeNull();
    expect(computeDailyAllowance({ available: 5000, spent: 100 }, "2026-10", "2026-11-21")).toBeNull();
    expect(computeDailyAllowance({ available: 5000, spent: 5200 }, "2026-11", "2026-11-21")).toBeNull();
  });
});

describe("describeSpendingReminder", () => {
  const daily = { daysLeft: 10, perDay: 300, todayLeft: 100 };

  it("says how much is left today", () => {
    expect(describeSpendingReminder({ available: 15000, spent: 12200 }, daily)).toEqual({
      text: "今天還能花 $100（平均一天 $300）。",
      isWarning: false,
    });
  });

  it("warns when today is over its share, and when the whole month is overspent", () => {
    expect(describeSpendingReminder({ available: 15000, spent: 12500 }, { ...daily, todayLeft: -200 })).toEqual({
      text: "今天已超過當日額度 $200，這個月還剩 $2,500。",
      isWarning: true,
    });
    expect(describeSpendingReminder({ available: 15000, spent: 16200 }, null)).toEqual({
      text: "這個月已超支 $1,200，今天盡量別再花這一項。",
      isWarning: true,
    });
  });

  it("stays quiet without a budget or without a daily figure", () => {
    expect(describeSpendingReminder({ available: 0, spent: 500 }, null)).toBeNull();
    expect(describeSpendingReminder({ available: 5000, spent: 100 }, null)).toBeNull();
  });
});
