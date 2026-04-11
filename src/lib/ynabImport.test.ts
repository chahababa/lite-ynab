import { describe, expect, it } from "vitest";

import { buildYnabImportPreview } from "@/lib/ynabImport";

describe("buildYnabImportPreview", () => {
  it("keeps active categories and flattens YNAB outflow transactions", () => {
    const preview = buildYnabImportPreview({
      plan: {
        id: "plan-1",
        name: "家庭帳本",
      },
      accounts: [
        { id: "acc-cash", name: "現金" },
        { id: "acc-card", name: "信用卡" },
      ],
      categoryGroups: [
        { id: "group-food", name: "飲食" },
        { id: "group-hidden", name: "Internal Master Category" },
      ],
      categories: [
        { id: "cat-breakfast", category_group_id: "group-food", name: "早餐" },
        { id: "cat-coffee", category_group_id: "group-food", name: "咖啡" },
        { id: "cat-hidden", category_group_id: "group-hidden", name: "不該出現" },
      ],
      transactions: [
        {
          id: "tx-1",
          date: "2026-04-01",
          amount: -125000,
          account_name: "現金",
          payee_name: "早餐店",
          memo: "火腿蛋餅",
          category_id: "cat-breakfast",
          category_name: "早餐",
        },
        {
          id: "tx-2",
          date: "2026-04-03",
          amount: -210000,
          account_name: "信用卡",
          payee_name: "超商",
          memo: "拆單測試",
          subtransactions: [
            {
              id: "sub-1",
              amount: -80000,
              memo: "咖啡",
              category_id: "cat-coffee",
              category_name: "咖啡",
            },
            {
              id: "sub-2",
              amount: -130000,
              memo: "早餐",
              category_id: "cat-breakfast",
              category_name: "早餐",
            },
          ],
        },
        {
          id: "tx-3",
          date: "2026-04-04",
          amount: 500000,
          account_name: "現金",
          payee_name: "薪轉",
          memo: "收入",
          category_id: "cat-breakfast",
          category_name: "早餐",
        },
        {
          id: "tx-4",
          date: "2026-04-05",
          amount: -50000,
          account_name: "現金",
          payee_name: "轉帳",
          transfer_account_id: "acc-card",
          category_id: "cat-breakfast",
          category_name: "早餐",
        },
      ],
    });

    expect(preview.groupNames).toEqual(["飲食"]);
    expect(preview.categoryPairs).toEqual([
      { groupName: "飲食", categoryName: "早餐" },
      { groupName: "飲食", categoryName: "咖啡" },
    ]);
    expect(preview.paymentMethodNames).toEqual(["信用卡", "現金"]);
    expect(preview.transactions).toEqual([
      {
        sourceId: "tx-1",
        date: "2026-04-01",
        monthId: "2026-04",
        amount: 125,
        note: "早餐店｜火腿蛋餅",
        accountName: "現金",
        categoryGroupName: "飲食",
        categoryName: "早餐",
      },
      {
        sourceId: "tx-2:sub-1",
        date: "2026-04-03",
        monthId: "2026-04",
        amount: 80,
        note: "超商｜咖啡",
        accountName: "信用卡",
        categoryGroupName: "飲食",
        categoryName: "咖啡",
      },
      {
        sourceId: "tx-2:sub-2",
        date: "2026-04-03",
        monthId: "2026-04",
        amount: 130,
        note: "超商｜早餐",
        accountName: "信用卡",
        categoryGroupName: "飲食",
        categoryName: "早餐",
      },
    ]);
    expect(preview.startDate).toBe("2026-04-01");
    expect(preview.endDate).toBe("2026-04-03");
  });
});
