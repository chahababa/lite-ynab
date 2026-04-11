import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cn,
  formatCurrency,
  formatMonthLabel,
  getTodayInTaipei,
  monthDateRange,
  shiftMonth,
  toMonthId,
} from "@/lib/utils";

describe("utils", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gets today's date in Taipei", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T16:30:00.000Z"));

    expect(getTodayInTaipei()).toBe("2026-04-04");
  });

  it("derives month id from Taipei local date", () => {
    expect(toMonthId(new Date("2026-03-31T16:30:00.000Z"))).toBe("2026-04");
    expect(toMonthId("2026-04")).toBe("2026-04");
    expect(toMonthId("2026-04-20")).toBe("2026-04");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("formats month labels for the switcher", () => {
    expect(formatMonthLabel("2026-04")).toBe("2026 年 4 月");
  });

  it("builds month date ranges", () => {
    expect(monthDateRange("2026-04")).toEqual({
      start: "2026-04-01",
      end: "2026-05-01",
    });
  });

  it("formats TWD currency without decimals", () => {
    const formatted = formatCurrency(12345);

    expect(formatted).toContain("12,345");
    expect(formatted).not.toContain(".00");
  });

  it("joins truthy class names", () => {
    expect(cn("base", false, undefined, "accent", null)).toBe("base accent");
  });
});
