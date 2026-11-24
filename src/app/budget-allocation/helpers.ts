export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  // Supabase PostgrestError 不是 Error instance，但有 .message / .code / .details / .hint
  if (typeof error === "object" && error !== null) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    if (e.message) {
      const code = e.code ? ` (${e.code})` : "";
      const hint = e.hint ? ` — ${e.hint}` : "";
      return `${e.message}${code}${hint}`;
    }
  }
  return "發生未預期的錯誤";
}

type CategoryInsertClient = ReturnType<typeof import("@/lib/supabaseClient").getSupabaseBrowserClient>;

/** Inserts a category (小項) plus its budget row for the month and returns the row to show on the page. */
export async function createCategoryWithBudget(
  supabase: CategoryInsertClient,
  monthId: string,
  group: { groupId: string; groupName: string },
  name: string,
  sortOrder: number,
): Promise<import("@/lib/types").BudgetRow> {
  const categoryResult = await supabase
    .from("categories")
    .insert({
      category_group_id: group.groupId,
      name,
      is_auto: false,
      auto_amount: 0,
      is_quick: false,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (categoryResult.error || !categoryResult.data) {
    throw categoryResult.error ?? new Error("新增分類失敗");
  }

  const budgetResult = await supabase
    .from("budgets")
    .insert({ month_id: monthId, category_id: categoryResult.data.id, allocated: 0 })
    .select("id")
    .single();

  if (budgetResult.error || !budgetResult.data) {
    throw budgetResult.error ?? new Error("新增預算失敗");
  }

  return {
    budgetId: budgetResult.data.id,
    categoryId: categoryResult.data.id,
    categoryGroupId: group.groupId,
    categoryGroupName: group.groupName,
    categoryName: name,
    allocated: 0,
    carryover: 0,
    spent: 0,
    remaining: 0,
    isQuick: false,
    isAuto: false,
    autoAmount: 0,
    warning: null,
  };
}
