import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { DailyTransactionBackupInput } from "./dailyTransactionBackup";

export function createDailyTransactionBackupServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function fetchDailyTransactionBackupInput({ userId: rawUserId, supabase: client }: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<DailyTransactionBackupInput> {
  const userId = rawUserId?.trim();
  if (!userId) throw new Error("Missing LITEYNAB_USER_ID; daily transaction backup requires explicit tenant scope");
  const supabase = client ?? createDailyTransactionBackupServiceClient();

  const [transactions, categories, categoryGroups, paymentMethods] = await Promise.all([
    fetchAllRows<DailyTransactionBackupInput["transactions"][number]>(supabase, userId, "transactions",
      "id, date, amount, category_id, payment_method_id, note, source, source_text, source_id, metadata, created_at, updated_at"),
    fetchAllRows<DailyTransactionBackupInput["categories"][number]>(supabase, userId, "categories", "id, category_group_id, name"),
    fetchAllRows<DailyTransactionBackupInput["categoryGroups"][number]>(supabase, userId, "category_groups", "id, name"),
    fetchAllRows<DailyTransactionBackupInput["paymentMethods"][number]>(supabase, userId, "payment_methods", "id, name"),
  ]);

  return { transactions, categories, categoryGroups, paymentMethods };
}

async function fetchAllRows<T extends { id: string }>(supabase: SupabaseClient, userId: string, table: string, columns: string): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  const ids = new Set<string>();
  let expectedCount: number | undefined;
  for (;;) {
    const result = await supabase
      .from(table)
      .select(columns, { count: "exact" })
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);
    if (result.error) throw new Error("Daily backup source read failed");
    if (result.data === null || result.count === null || result.count < 0) throw new Error("Daily backup source count missing");
    expectedCount ??= result.count;
    if (result.count !== expectedCount) throw new Error("Daily backup source changed during pagination; retry later");
    const page = result.data as unknown as T[];
    for (const row of page) {
      if (!row.id || ids.has(row.id)) throw new Error("Daily backup source has duplicate or missing IDs");
      ids.add(row.id);
    }
    rows.push(...page);
    if (rows.length === expectedCount) return rows;
    if (rows.length > expectedCount || page.length === 0) throw new Error("Daily backup source pagination incomplete");
    // Advance by the actual rows returned, including when the server cap is < 1000.
  }
}
