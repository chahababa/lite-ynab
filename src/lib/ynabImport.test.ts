import { describe, expect, it } from "vitest";

import { buildYnabImportPreview, importYnabPreviewToLiteYnab } from "@/lib/ynabImport";

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


describe("importYnabPreviewToLiteYnab", () => {
  function createSupabaseMock(existingTransactions: unknown[] = []) {
    const insertedByTable = new Map<string, unknown[][]>();
    const selectCounts = new Map<string, number>();
    const rpcCalls: unknown[] = [];

    const tableData: Record<string, unknown[]> = {
      category_groups: [
        {
          id: "group-food",
          user_id: "user-1",
          name: "飲食",
          sort_order: 10,
        },
      ],
      categories: [
        {
          id: "cat-breakfast",
          user_id: "user-1",
          category_group_id: "group-food",
          name: "早餐",
          is_auto: false,
          auto_amount: 0,
          is_quick: false,
          sort_order: 10,
        },
      ],
      payment_methods: [
        {
          id: "pm-cash",
          user_id: "user-1",
          name: "現金",
          sort_order: 10,
        },
      ],
      transactions: existingTransactions,
    };

    const supabase = {
      rpc: async (name: string, payload: unknown) => {
        rpcCalls.push({ name, payload });
        return { error: null };
      },
      from: (table: string) => ({
        select: () => {
          const count = (selectCounts.get(table) ?? 0) + 1;
          selectCounts.set(table, count);
          const result = { data: tableData[table] ?? [], error: null };

          if (table === "transactions") {
            return {
              gte: () => ({
                lte: async () => result,
              }),
            };
          }

          return {
            order: async () => result,
          };
        },
        insert: async (rows: unknown[]) => {
          const rowsArray = Array.isArray(rows) ? rows : [rows];
          insertedByTable.set(table, [...(insertedByTable.get(table) ?? []), rowsArray]);
          tableData[table] = [...(tableData[table] ?? []), ...rowsArray];
          return { error: null };
        },
      }),
    };

    return { supabase, insertedByTable, rpcCalls };
  }

  const preview = {
    planId: "plan-1",
    planName: "家庭帳本",
    groupNames: ["飲食"],
    categoryPairs: [{ groupName: "飲食", categoryName: "早餐" }],
    paymentMethodNames: ["現金"],
    transactions: [
      {
        sourceId: "ynab-tx-1",
        date: "2026-04-01",
        monthId: "2026-04",
        amount: 125,
        note: "早餐店｜火腿蛋餅",
        accountName: "現金",
        categoryGroupName: "飲食",
        categoryName: "早餐",
      },
    ],
    sampleTransactions: [],
    startDate: "2026-04-01",
    endDate: "2026-04-01",
  };

  it("marks imported transactions with YNAB source metadata", async () => {
    const { supabase, insertedByTable, rpcCalls } = createSupabaseMock();

    const result = await importYnabPreviewToLiteYnab(supabase as never, preview);

    expect(result).toEqual({
      createdGroupCount: 0,
      createdCategoryCount: 0,
      createdPaymentMethodCount: 0,
      importedTransactionCount: 1,
      skippedDuplicateCount: 0,
    });
    expect(rpcCalls).toEqual([
      { name: "initialize_monthly_budget", payload: { p_month_id: "2026-04" } },
    ]);
    expect(insertedByTable.get("transactions")?.[0]).toEqual([
      {
        date: "2026-04-01",
        amount: 125,
        category_id: "cat-breakfast",
        payment_method_id: "pm-cash",
        note: "早餐店｜火腿蛋餅",
        source: "ynab_import",
        source_text: "YNAB import: 家庭帳本",
        source_id: "ynab-tx-1",
        metadata: {
          ynab: {
            planId: "plan-1",
            planName: "家庭帳本",
            sourceId: "ynab-tx-1",
            accountName: "現金",
            categoryGroupName: "飲食",
            categoryName: "早餐",
          },
        },
      },
    ]);
  });

  it("skips rows already imported from the same YNAB source id", async () => {
    const { supabase, insertedByTable } = createSupabaseMock([
      {
        date: "2026-04-01",
        amount: 999,
        category_id: "cat-breakfast",
        payment_method_id: "pm-cash",
        note: "不同內容但同一個 YNAB source id",
        source: "ynab_import",
        source_id: "ynab-tx-1",
      },
    ]);

    const result = await importYnabPreviewToLiteYnab(supabase as never, preview);

    expect(result.importedTransactionCount).toBe(0);
    expect(result.skippedDuplicateCount).toBe(1);
    expect(insertedByTable.get("transactions")).toBeUndefined();
  });
});
