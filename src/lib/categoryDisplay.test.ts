import { describe, expect, it } from "vitest";

import {
  getAmbiguousCategoryNames,
  getCategoryDisplay,
} from "@/lib/categoryDisplay";
import type { CategoryOption } from "@/lib/types";

function makeCat(id: string, name: string, groupName: string): CategoryOption {
  return {
    id,
    groupId: `group-${groupName}`,
    groupName,
    name,
    isQuick: true,
    isAuto: false,
    autoAmount: 0,
    sortOrder: 10,
  };
}

describe("getAmbiguousCategoryNames", () => {
  it("returns names that appear in 2+ categories", () => {
    const cats = [
      makeCat("a", "飲食", "個人"),
      makeCat("b", "飲食", "家庭"),
      makeCat("c", "交通", "個人"),
      makeCat("d", "咖啡", "個人"),
    ];
    const dupes = getAmbiguousCategoryNames(cats);
    expect(dupes.has("飲食")).toBe(true);
    expect(dupes.has("交通")).toBe(false);
    expect(dupes.has("咖啡")).toBe(false);
    expect(dupes.size).toBe(1);
  });

  it("returns empty set when all unique", () => {
    const cats = [
      makeCat("a", "飲食", "個人"),
      makeCat("b", "交通", "個人"),
    ];
    expect(getAmbiguousCategoryNames(cats).size).toBe(0);
  });

  it("handles empty input", () => {
    expect(getAmbiguousCategoryNames([]).size).toBe(0);
  });
});

describe("getCategoryDisplay", () => {
  it("returns primary only when name is unique", () => {
    const ambiguous = new Set<string>();
    const result = getCategoryDisplay({ name: "咖啡", groupName: "個人" }, ambiguous);
    expect(result.primary).toBe("咖啡");
    expect(result.secondary).toBeUndefined();
  });

  it("returns primary + secondary (groupName) when name is ambiguous", () => {
    const ambiguous = new Set(["飲食"]);
    const result = getCategoryDisplay({ name: "飲食", groupName: "個人" }, ambiguous);
    expect(result.primary).toBe("飲食");
    expect(result.secondary).toBe("個人");
  });
});
