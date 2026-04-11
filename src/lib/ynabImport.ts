import type { SupabaseClient } from "@supabase/supabase-js";

import type { Category, CategoryGroup, PaymentMethod, Transaction } from "@/lib/types";
import { toMonthId } from "@/lib/utils";

export type YnabPlan = {
  id: string;
  name: string;
  last_modified_on?: string | null;
  first_month?: string | null;
  last_month?: string | null;
};

export type YnabAccount = {
  id: string;
  name: string;
  type?: string | null;
  closed?: boolean;
  deleted?: boolean;
  on_budget?: boolean;
};

export type YnabCategoryGroup = {
  id: string;
  name: string;
  hidden?: boolean;
  deleted?: boolean;
};

export type YnabCategory = {
  id: string;
  category_group_id: string;
  category_group_name?: string | null;
  name: string;
  hidden?: boolean;
  deleted?: boolean;
};

export type YnabSubtransaction = {
  id?: string;
  memo?: string | null;
  amount: number;
  category_id?: string | null;
  category_name?: string | null;
};

export type YnabTransaction = {
  id: string;
  date: string;
  amount: number;
  memo?: string | null;
  payee_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  deleted?: boolean;
  transfer_account_id?: string | null;
  parent_transaction_id?: string | null;
  subtransactions?: YnabSubtransaction[];
};

export type YnabPlanSnapshot = {
  plan: YnabPlan;
  accounts: YnabAccount[];
  categoryGroups: YnabCategoryGroup[];
  categories: YnabCategory[];
  transactions: YnabTransaction[];
};

export type YnabImportTransaction = {
  sourceId: string;
  date: string;
  monthId: string;
  amount: number;
  note: string;
  accountName: string;
  categoryGroupName: string;
  categoryName: string;
};

export type YnabImportPreview = {
  planId: string;
  planName: string;
  groupNames: string[];
  categoryPairs: Array<{ groupName: string; categoryName: string }>;
  paymentMethodNames: string[];
  transactions: YnabImportTransaction[];
  sampleTransactions: YnabImportTransaction[];
  startDate: string | null;
  endDate: string | null;
};

export type YnabImportResult = {
  createdGroupCount: number;
  createdCategoryCount: number;
  createdPaymentMethodCount: number;
  importedTransactionCount: number;
  skippedDuplicateCount: number;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeYnabOutflow(amount: number): number {
  if (amount >= 0) {
    return 0;
  }

  return Math.round(Math.abs(amount) / 1000);
}

function isActiveGroup(group: YnabCategoryGroup) {
  const normalized = normalizeText(group.name);
  return !group.deleted && normalized !== "" && normalized !== "Internal Master Category";
}

function isActiveCategory(category: YnabCategory, groupNamesById: Map<string, string>) {
  return !category.deleted && normalizeText(category.name) !== "" && groupNamesById.has(category.category_group_id);
}

function buildImportedNote(payeeName?: string | null, memo?: string | null) {
  const fragments = [normalizeText(payeeName), normalizeText(memo)].filter(Boolean);
  return fragments.join("｜");
}

export function buildYnabImportPreview(snapshot: YnabPlanSnapshot): YnabImportPreview {
  const activeGroups = snapshot.categoryGroups.filter(isActiveGroup);
  const groupNamesById = new Map(activeGroups.map((group) => [group.id, normalizeText(group.name)] as const));

  const activeCategories = snapshot.categories.filter((category) =>
    isActiveCategory(category, groupNamesById),
  );

  const categoriesById = new Map(
    activeCategories.map((category) => [
      category.id,
      {
        groupName:
          normalizeText(category.category_group_name) || groupNamesById.get(category.category_group_id) || "",
        categoryName: normalizeText(category.name),
      },
    ]),
  );

  const paymentMethodNames = Array.from(
    new Set(
      snapshot.accounts
        .filter((account) => !account.deleted && normalizeText(account.name) !== "")
        .map((account) => normalizeText(account.name)),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-Hant"));

  const categoryPairs = activeCategories
    .map((category) => ({
      groupName: groupNamesById.get(category.category_group_id) || normalizeText(category.category_group_name),
      categoryName: normalizeText(category.name),
    }))
    .filter((pair) => pair.groupName && pair.categoryName)
    .sort((left, right) => {
      const groupCompare = left.groupName.localeCompare(right.groupName, "zh-Hant");
      return groupCompare !== 0
        ? groupCompare
        : left.categoryName.localeCompare(right.categoryName, "zh-Hant");
    });

  const flattenedTransactions: YnabImportTransaction[] = [];

  const pushTransaction = (
    sourceId: string,
    date: string,
    amount: number,
    payeeName: string | null | undefined,
    memo: string | null | undefined,
    accountName: string | null | undefined,
    categoryId: string | null | undefined,
    categoryName: string | null | undefined,
  ) => {
    const normalizedAmount = normalizeYnabOutflow(amount);
    const normalizedAccountName = normalizeText(accountName);

    if (normalizedAmount <= 0 || normalizedAccountName === "" || !categoryId) {
      return;
    }

    const category = categoriesById.get(categoryId);
    const resolvedCategoryName = normalizeText(categoryName) || category?.categoryName || "";
    const resolvedGroupName = category?.groupName || "";

    if (resolvedCategoryName === "" || resolvedGroupName === "") {
      return;
    }

    flattenedTransactions.push({
      sourceId,
      date,
      monthId: toMonthId(date),
      amount: normalizedAmount,
      note: buildImportedNote(payeeName, memo),
      accountName: normalizedAccountName,
      categoryGroupName: resolvedGroupName,
      categoryName: resolvedCategoryName,
    });
  };

  for (const transaction of snapshot.transactions) {
    if (
      transaction.deleted ||
      transaction.parent_transaction_id ||
      transaction.transfer_account_id
    ) {
      continue;
    }

    const subtransactions = transaction.subtransactions ?? [];

    if (subtransactions.length > 0) {
      for (const subtransaction of subtransactions) {
        pushTransaction(
          `${transaction.id}:${subtransaction.id ?? "split"}`,
          transaction.date,
          subtransaction.amount,
          transaction.payee_name,
          normalizeText(subtransaction.memo) || transaction.memo,
          transaction.account_name,
          subtransaction.category_id,
          subtransaction.category_name,
        );
      }

      continue;
    }

    pushTransaction(
      transaction.id,
      transaction.date,
      transaction.amount,
      transaction.payee_name,
      transaction.memo,
      transaction.account_name,
      transaction.category_id,
      transaction.category_name,
    );
  }

  flattenedTransactions.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    return left.sourceId.localeCompare(right.sourceId, "en");
  });

  return {
    planId: snapshot.plan.id,
    planName: snapshot.plan.name,
    groupNames: Array.from(new Set(categoryPairs.map((pair) => pair.groupName))).sort((left, right) =>
      left.localeCompare(right, "zh-Hant"),
    ),
    categoryPairs,
    paymentMethodNames,
    transactions: flattenedTransactions,
    sampleTransactions: flattenedTransactions.slice(0, 5),
    startDate: flattenedTransactions[0]?.date ?? null,
    endDate:
      flattenedTransactions.length > 0
        ? flattenedTransactions[flattenedTransactions.length - 1]?.date ?? null
        : null,
  };
}

function buildCategoryKey(groupId: string, categoryName: string) {
  return `${groupId}:${categoryName}`;
}

function buildTransactionSignature(transaction: {
  date: string;
  amount: number;
  categoryId: string;
  paymentMethodId: string;
  note: string;
}) {
  return [
    transaction.date,
    transaction.amount,
    transaction.categoryId,
    transaction.paymentMethodId,
    transaction.note.trim(),
  ].join("|");
}

async function ensureMonthsInitialized(
  supabase: SupabaseClient,
  monthIds: string[],
) {
  for (const monthId of monthIds) {
    const { error } = await supabase.rpc("initialize_monthly_budget", {
      p_month_id: monthId,
    });

    if (error) {
      throw error;
    }
  }
}

export async function importYnabPreviewToLiteYnab(
  supabase: SupabaseClient,
  preview: YnabImportPreview,
): Promise<YnabImportResult> {
  const [groupsResult, categoriesResult, paymentMethodsResult] = await Promise.all([
    supabase.from("category_groups").select("*").order("sort_order", { ascending: true }),
    supabase.from("categories").select("*").order("sort_order", { ascending: true }),
    supabase.from("payment_methods").select("*").order("sort_order", { ascending: true }),
  ]);

  if (groupsResult.error) {
    throw groupsResult.error;
  }
  if (categoriesResult.error) {
    throw categoriesResult.error;
  }
  if (paymentMethodsResult.error) {
    throw paymentMethodsResult.error;
  }

  let groups = (groupsResult.data ?? []) as CategoryGroup[];
  let categories = (categoriesResult.data ?? []) as Category[];
  let paymentMethods = (paymentMethodsResult.data ?? []) as PaymentMethod[];

  const groupByName = new Map(groups.map((group) => [group.name, group] as const));
  const nextGroupSortOrder = () =>
    (groups.reduce((max, group) => Math.max(max, group.sort_order), 0) || 0) + 10;

  const missingGroups = preview.groupNames.filter((name) => !groupByName.has(name));

  if (missingGroups.length > 0) {
    const insertGroupsResult = await supabase.from("category_groups").insert(
      missingGroups.map((name, index) => ({
        name,
        sort_order: nextGroupSortOrder() + index * 10,
      })),
    );

    if (insertGroupsResult.error) {
      throw insertGroupsResult.error;
    }

    const refreshedGroupsResult = await supabase
      .from("category_groups")
      .select("*")
      .order("sort_order", { ascending: true });

    if (refreshedGroupsResult.error) {
      throw refreshedGroupsResult.error;
    }

    groups = (refreshedGroupsResult.data ?? []) as CategoryGroup[];
  }

  const refreshedGroupByName = new Map(groups.map((group) => [group.name, group] as const));
  const categoryByKey = new Map(
    categories.map((category) => [buildCategoryKey(category.category_group_id, category.name), category] as const),
  );
  const categorySortByGroupId = new Map<string, number>();

  for (const category of categories) {
    categorySortByGroupId.set(
      category.category_group_id,
      Math.max(categorySortByGroupId.get(category.category_group_id) ?? 0, category.sort_order),
    );
  }

  const categoriesToInsert = preview.categoryPairs
    .map((pair) => {
      const group = refreshedGroupByName.get(pair.groupName);

      if (!group) {
        return null;
      }

      const key = buildCategoryKey(group.id, pair.categoryName);

      if (categoryByKey.has(key)) {
        return null;
      }

      const nextSortOrder = (categorySortByGroupId.get(group.id) ?? 0) + 10;
      categorySortByGroupId.set(group.id, nextSortOrder);

      return {
        category_group_id: group.id,
        name: pair.categoryName,
        is_auto: false,
        auto_amount: 0,
        is_quick: false,
        sort_order: nextSortOrder,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  if (categoriesToInsert.length > 0) {
    const insertCategoriesResult = await supabase.from("categories").insert(categoriesToInsert);

    if (insertCategoriesResult.error) {
      throw insertCategoriesResult.error;
    }

    const refreshedCategoriesResult = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (refreshedCategoriesResult.error) {
      throw refreshedCategoriesResult.error;
    }

    categories = (refreshedCategoriesResult.data ?? []) as Category[];
  }

  const categoryMap = new Map(
    categories.map((category) => [buildCategoryKey(category.category_group_id, category.name), category] as const),
  );

  const paymentMethodByName = new Map(paymentMethods.map((method) => [method.name, method] as const));
  const nextPaymentMethodSortOrder = () =>
    (paymentMethods.reduce((max, method) => Math.max(max, method.sort_order), 0) || 0) + 10;

  const missingPaymentMethods = preview.paymentMethodNames.filter((name) => !paymentMethodByName.has(name));

  if (missingPaymentMethods.length > 0) {
    const insertPaymentMethodsResult = await supabase.from("payment_methods").insert(
      missingPaymentMethods.map((name, index) => ({
        name,
        sort_order: nextPaymentMethodSortOrder() + index * 10,
      })),
    );

    if (insertPaymentMethodsResult.error) {
      throw insertPaymentMethodsResult.error;
    }

    const refreshedPaymentMethodsResult = await supabase
      .from("payment_methods")
      .select("*")
      .order("sort_order", { ascending: true });

    if (refreshedPaymentMethodsResult.error) {
      throw refreshedPaymentMethodsResult.error;
    }

    paymentMethods = (refreshedPaymentMethodsResult.data ?? []) as PaymentMethod[];
  }

  const paymentMethodMap = new Map(paymentMethods.map((method) => [method.name, method] as const));
  const monthIds = Array.from(new Set(preview.transactions.map((transaction) => transaction.monthId))).sort();
  await ensureMonthsInitialized(supabase, monthIds);

  if (preview.transactions.length === 0) {
    return {
      createdGroupCount: missingGroups.length,
      createdCategoryCount: categoriesToInsert.length,
      createdPaymentMethodCount: missingPaymentMethods.length,
      importedTransactionCount: 0,
      skippedDuplicateCount: 0,
    };
  }

  const existingTransactionsResult = await supabase
    .from("transactions")
    .select("date,amount,category_id,payment_method_id,note")
    .gte("date", preview.startDate ?? "1970-01-01")
    .lte("date", preview.endDate ?? "2999-12-31");

  if (existingTransactionsResult.error) {
    throw existingTransactionsResult.error;
  }

  const existingTransactionSignatures = new Set(
    ((existingTransactionsResult.data ?? []) as Pick<
      Transaction,
      "date" | "amount" | "category_id" | "payment_method_id" | "note"
    >[]).map((transaction) =>
      buildTransactionSignature({
        date: transaction.date,
        amount: transaction.amount,
        categoryId: transaction.category_id,
        paymentMethodId: transaction.payment_method_id,
        note: transaction.note,
      }),
    ),
  );

  const transactionsToInsert = preview.transactions
    .map((transaction) => {
      const group = refreshedGroupByName.get(transaction.categoryGroupName);
      const paymentMethod = paymentMethodMap.get(transaction.accountName);

      if (!group || !paymentMethod) {
        return null;
      }

      const category = categoryMap.get(buildCategoryKey(group.id, transaction.categoryName));

      if (!category) {
        return null;
      }

      const nextTransaction = {
        date: transaction.date,
        amount: transaction.amount,
        category_id: category.id,
        payment_method_id: paymentMethod.id,
        note: transaction.note,
      };

      const signature = buildTransactionSignature({
        date: nextTransaction.date,
        amount: nextTransaction.amount,
        categoryId: nextTransaction.category_id,
        paymentMethodId: nextTransaction.payment_method_id,
        note: nextTransaction.note,
      });

      if (existingTransactionSignatures.has(signature)) {
        return null;
      }

      existingTransactionSignatures.add(signature);
      return nextTransaction;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  for (let index = 0; index < transactionsToInsert.length; index += 200) {
    const chunk = transactionsToInsert.slice(index, index + 200);
    const insertTransactionsResult = await supabase.from("transactions").insert(chunk);

    if (insertTransactionsResult.error) {
      throw insertTransactionsResult.error;
    }
  }

  return {
    createdGroupCount: missingGroups.length,
    createdCategoryCount: categoriesToInsert.length,
    createdPaymentMethodCount: missingPaymentMethods.length,
    importedTransactionCount: transactionsToInsert.length,
    skippedDuplicateCount: preview.transactions.length - transactionsToInsert.length,
  };
}
