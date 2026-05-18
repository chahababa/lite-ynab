import { describe, expect, it } from "vitest";

import { buildAutoBudgetAdjustmentReminder } from "./autoBudgetLearning";

describe("buildAutoBudgetAdjustmentReminder", () => {
  it("reminds users when an auto-budget category is manually changed away from its fixed amount", () => {
    expect(
      buildAutoBudgetAdjustmentReminder({
        categoryName: "飲食",
        isAuto: true,
        autoAmount: 6000,
        allocated: 7200,
      }),
    ).toBe("飲食 本月預算和固定預算不同，系統會記錄這次手動調整；如果常常調整，建議更新固定預算。");
  });

  it("does not remind when the manual amount matches the fixed amount", () => {
    expect(
      buildAutoBudgetAdjustmentReminder({
        categoryName: "飲食",
        isAuto: true,
        autoAmount: 6000,
        allocated: 6000,
      }),
    ).toBeNull();
  });

  it("does not remind for categories without fixed budget enabled", () => {
    expect(
      buildAutoBudgetAdjustmentReminder({
        categoryName: "娛樂",
        isAuto: false,
        autoAmount: 0,
        allocated: 1200,
      }),
    ).toBeNull();
  });
});
