import { describe, expect, it } from "vitest";

import { buildHermesTransactionInsert, parseHermesTransactionText } from "@/lib/hermesTransaction";

const categories = [
  { id: "cat-food", name: "飲食", groupName: "個人" },
  { id: "cat-breakfast", name: "早餐", groupName: "個人" },
  { id: "cat-daily", name: "日常用品", groupName: "家庭" },
];

const paymentMethods = [
  { id: "pm-cash", name: "現金" },
  { id: "pm-card", name: "玉山卡" },
];

describe("parseHermesTransactionText", () => {
  it("extracts amount, category, payment method, note and defaults to the Taipei base date", () => {
    const parsed = parseHermesTransactionText("早餐 85 現金 蛋餅", {
      categories,
      paymentMethods,
      baseDate: "2026-05-18",
    });

    expect(parsed).toMatchObject({
      amount: 85,
      date: "2026-05-18",
      categoryId: "cat-breakfast",
      paymentMethodId: "pm-cash",
      note: "蛋餅",
    });
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("understands yesterday and explicit ISO dates", () => {
    expect(
      parseHermesTransactionText("昨天 全聯 1240 玉山卡 日常用品", {
        categories,
        paymentMethods,
        baseDate: "2026-05-18",
      }),
    ).toMatchObject({
      amount: 1240,
      date: "2026-05-17",
      categoryId: "cat-daily",
      paymentMethodId: "pm-card",
      note: "全聯",
    });

    expect(
      parseHermesTransactionText("2026-05-10 飲食 320 現金", {
        categories,
        paymentMethods,
        baseDate: "2026-05-18",
      }),
    ).toMatchObject({
      amount: 320,
      date: "2026-05-10",
      categoryId: "cat-food",
      paymentMethodId: "pm-cash",
    });
  });

  it("parses common in-app quick text with group/category slash and day-before date", () => {
    const parsed = parseHermesTransactionText("前天 早餐 80 現金 個人/飲食", {
      categories,
      paymentMethods,
      baseDate: "2026-05-18",
    });

    expect(parsed).toMatchObject({
      amount: 80,
      date: "2026-05-16",
      categoryId: "cat-food",
      paymentMethodId: "pm-cash",
      note: "早餐",
      warnings: [],
    });
  });

  it("refuses ambiguous bare category names when duplicate groups exist", () => {
    const parsed = parseHermesTransactionText("房租 12000 現金", {
      categories: [
        { id: "cat-home-rent", name: "房租", groupName: "家庭" },
        { id: "cat-other-rent", name: "房租", groupName: "其他" },
      ],
      paymentMethods,
      baseDate: "2026-05-18",
    });

    expect(parsed.categoryId).toBeNull();
    expect(parsed.categoryName).toBeNull();
    expect(parsed.note).toBe("");
    expect(parsed.warnings).toContain("分類「房租」同時存在於多個大項，請指定大項（例如：家庭 房租）");
  });

  it("uses group-qualified category names to resolve duplicates", () => {
    const parsed = parseHermesTransactionText("家庭 房租 12000 現金 五月", {
      categories: [
        { id: "cat-home-rent", name: "房租", groupName: "家庭" },
        { id: "cat-other-rent", name: "房租", groupName: "其他" },
      ],
      paymentMethods,
      baseDate: "2026-05-18",
    });

    expect(parsed).toMatchObject({
      amount: 12000,
      categoryId: "cat-home-rent",
      categoryName: "房租",
      paymentMethodId: "pm-cash",
      note: "五月",
      warnings: [],
    });
  });

  it("supports slash-separated group-qualified category names", () => {
    const parsed = parseHermesTransactionText("其他/房租 12000 現金", {
      categories: [
        { id: "cat-home-rent", name: "房租", groupName: "家庭" },
        { id: "cat-other-rent", name: "房租", groupName: "其他" },
      ],
      paymentMethods,
      baseDate: "2026-05-18",
    });

    expect(parsed.categoryId).toBe("cat-other-rent");
    expect(parsed.note).toBe("");
  });

  it("returns actionable warnings when required fields cannot be inferred", () => {
    const parsed = parseHermesTransactionText("不知道 花了 200", {
      categories,
      paymentMethods,
      baseDate: "2026-05-18",
    });

    expect(parsed.amount).toBe(200);
    expect(parsed.categoryId).toBeNull();
    expect(parsed.paymentMethodId).toBeNull();
    expect(parsed.warnings).toEqual(["找不到分類", "找不到支付方式"]);
    expect(parsed.confidence).toBeLessThan(0.7);
  });
});

describe("buildHermesTransactionInsert", () => {
  it("builds a Hermes-sourced Supabase insert payload with raw text and parser metadata", () => {
    const parsed = parseHermesTransactionText("早餐 85 現金 蛋餅", {
      categories,
      paymentMethods,
      baseDate: "2026-05-18",
    });

    expect(
      buildHermesTransactionInsert({
        userId: "user-1",
        rawText: "早餐 85 現金 蛋餅",
        parsed,
        sourceId: "telegram:123:456",
        context: { platform: "telegram", chatId: "123", messageId: "456" },
      }),
    ).toEqual({
      user_id: "user-1",
      amount: 85,
      date: "2026-05-18",
      category_id: "cat-breakfast",
      payment_method_id: "pm-cash",
      note: "蛋餅",
      source: "hermes",
      source_text: "早餐 85 現金 蛋餅",
      source_id: "telegram:123:456",
      metadata: {
        hermes: {
          parserVersion: 1,
          confidence: parsed.confidence,
          warnings: [],
          matchedCategoryName: "早餐",
          matchedPaymentMethodName: "現金",
          context: { platform: "telegram", chatId: "123", messageId: "456" },
        },
      },
    });
  });

  it("throws instead of building an incomplete transaction", () => {
    const parsed = parseHermesTransactionText("早餐 現金", {
      categories,
      paymentMethods,
      baseDate: "2026-05-18",
    });

    expect(() =>
      buildHermesTransactionInsert({
        userId: "user-1",
        rawText: "早餐 現金",
        parsed,
      }),
    ).toThrow("缺少金額");
  });
});
