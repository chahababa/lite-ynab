import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { DailyTransactionBackupInput } from "./dailyTransactionBackup";

export function createDailyTransactionBackupServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function fetchDailyTransactionBackupInput(
  supabase: SupabaseClient = createDailyTransactionBackupServiceClient(),
  userId = process.env.LITEYNAB_USER_ID?.trim(),
): Promise<DailyTransactionBackupInput> {
  if (!userId) throw new Error("Missing LITEYNAB_USER_ID; daily transaction backup requires explicit tenant scope");

  const [transactions, categoriesResult, groupsResult, paymentMethodsResult] = await Promise.all([
    fetchAllTransactions(supabase, userId),
    supabase.from("categories").select("id, category_group_id, name").eq("user_id", userId),
    supabase.from("category_groups").select("id, name").eq("user_id", userId),
    supabase.from("payment_methods").select("id, name").eq("user_id", userId),
  ]);
  throwIfError(categoriesResult.error);
  throwIfError(groupsResult.error);
  throwIfError(paymentMethodsResult.error);

  return {
    transactions,
    categories: categoriesResult.data ?? [],
    categoryGroups: groupsResult.data ?? [],
    paymentMethods: paymentMethodsResult.data ?? [],
  };
}

async function fetchAllTransactions(supabase: SupabaseClient, userId: string) {
  const pageSize = 1000;
  const transactions: DailyTransactionBackupInput["transactions"] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from("transactions")
      .select("id, date, amount, category_id, payment_method_id, note, source, source_text, source_id, metadata, created_at, updated_at")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    throwIfError(result.error);
    const page = result.data ?? [];
    transactions.push(...page);
    if (page.length < pageSize) return transactions;
  }
}

function throwIfError(error: unknown) {
  if (error) throw error;
}
