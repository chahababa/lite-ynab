import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { buildHermesTransactionInsert, parseHermesTransactionText } from "@/lib/hermesTransaction";
import type { PaymentMethod } from "@/lib/types";
import { getTodayInTaipei } from "@/lib/utils";

export const runtime = "nodejs";

type HermesTransactionRequest = {
  text?: string;
  userId?: string;
  sourceId?: string | null;
  context?: Record<string, unknown>;
  baseDate?: string;
};

type HermesTransactionCorrectionRequest = {
  userId?: string;
  target?: {
    transactionId?: string;
    sourceId?: string;
    latestHermes?: boolean;
    expectedAmount?: number;
    expectedDate?: string;
    expectedCategory?: string;
    expectedPaymentMethod?: string;
    expectedNote?: string;
  };
  updates?: {
    amount?: number;
    date?: string;
    category?: string;
    paymentMethod?: string;
    note?: string;
  };
  context?: Record<string, unknown>;
};

type HermesCategoryRow = {
  id: string;
  name: string;
  category_groups?: { name: string | null } | { name: string | null }[] | null;
};

type NormalizedCategory = {
  id: string;
  name: string;
  groupName: string | null;
};

type TransactionReadRow = {
  id: string;
  user_id: string;
  amount: number;
  date: string;
  category_id: string;
  payment_method_id: string;
  note: string | null;
  source: string | null;
  source_text: string | null;
  source_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string | null;
  categories?: { id?: string; name?: string | null; category_groups?: { name?: string | null } | null } | null;
  payment_methods?: { id?: string; name?: string | null } | null;
};

function normalizeHermesCategories(rows: HermesCategoryRow[]): NormalizedCategory[] {
  return rows.map((row) => {
    const group = Array.isArray(row.category_groups) ? row.category_groups[0] : row.category_groups;
    return {
      id: row.id,
      name: row.name,
      groupName: group?.name ?? null,
    };
  });
}

function isAuthorized(request: Request) {
  const secret = process.env.HERMES_WEBHOOK_SECRET;
  if (!secret) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  return token === secret;
}

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getUserId(body: { userId?: string }) {
  return process.env.LITEYNAB_USER_ID || body.userId?.trim() || null;
}

async function findExistingHermesTransaction(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sourceId: string | null | undefined,
) {
  if (!sourceId) return null;

  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("source", "hermes")
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string } | null) ?? null;
}

async function loadOptions(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const [categoriesResult, paymentMethodsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id,name,category_groups(name)")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase.from("payment_methods").select("id,name").eq("user_id", userId).order("sort_order", { ascending: true }),
  ]);

  if (categoriesResult.error) throw categoriesResult.error;
  if (paymentMethodsResult.error) throw paymentMethodsResult.error;

  return {
    categories: normalizeHermesCategories((categoriesResult.data ?? []) as HermesCategoryRow[]),
    paymentMethods: (paymentMethodsResult.data ?? []) as Pick<PaymentMethod, "id" | "name">[],
  };
}

function normalizeOptionText(value: string) {
  return value.replace(/\s+/g, "").replace(/[／>]/g, "/").toLocaleLowerCase("zh-TW");
}

function categoryLabel(category: Pick<NormalizedCategory, "name" | "groupName"> | null | undefined) {
  if (!category) return "";
  return category.groupName ? `${category.groupName}/${category.name}` : category.name;
}

function resolveCategoryByName(categories: NormalizedCategory[], value?: string) {
  const requested = value?.trim();
  if (!requested) return null;
  const normalized = normalizeOptionText(requested);

  const qualifiedMatch = categories.find((category) => normalizeOptionText(categoryLabel(category)) === normalized);
  if (qualifiedMatch) return qualifiedMatch;

  const nameMatches = categories.filter((category) => normalizeOptionText(category.name) === normalized);
  if (nameMatches.length === 1) return nameMatches[0];
  if (nameMatches.length > 1) {
    throw new Error(`分類「${requested}」同時存在於多個大項，請指定大項/分類`);
  }

  throw new Error(`找不到分類「${requested}」`);
}

function resolvePaymentMethodByName(paymentMethods: Pick<PaymentMethod, "id" | "name">[], value?: string) {
  const requested = value?.trim();
  if (!requested) return null;
  const normalized = normalizeOptionText(requested);
  const matches = paymentMethods.filter((method) => normalizeOptionText(method.name) === normalized);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`支付方式「${requested}」不唯一`);
  throw new Error(`找不到支付方式「${requested}」`);
}

function getRowCategoryName(row: TransactionReadRow) {
  const groupName = row.categories?.category_groups?.name;
  const categoryName = row.categories?.name;
  return groupName && categoryName ? `${groupName}/${categoryName}` : categoryName ?? null;
}

function getRowPaymentMethodName(row: TransactionReadRow) {
  return row.payment_methods?.name ?? null;
}

function publicTransaction(row: TransactionReadRow) {
  return {
    id: row.id,
    amount: row.amount,
    date: row.date,
    categoryId: row.category_id,
    category: getRowCategoryName(row),
    paymentMethodId: row.payment_method_id,
    paymentMethod: getRowPaymentMethodName(row),
    note: row.note ?? "",
    source: row.source,
    sourceId: row.source_id,
    sourceText: row.source_text,
    createdAt: row.created_at,
  };
}

function assertExpectedTarget(row: TransactionReadRow, target: NonNullable<HermesTransactionCorrectionRequest["target"]>) {
  const mismatches: string[] = [];
  if (target.expectedAmount !== undefined && row.amount !== target.expectedAmount) mismatches.push("amount");
  if (target.expectedDate && row.date !== target.expectedDate) mismatches.push("date");
  if (target.expectedNote !== undefined && (row.note ?? "") !== target.expectedNote) mismatches.push("note");
  if (target.expectedCategory && normalizeOptionText(getRowCategoryName(row) ?? "") !== normalizeOptionText(target.expectedCategory)) {
    mismatches.push("category");
  }
  if (
    target.expectedPaymentMethod &&
    normalizeOptionText(getRowPaymentMethodName(row) ?? "") !== normalizeOptionText(target.expectedPaymentMethod)
  ) {
    mismatches.push("paymentMethod");
  }

  if (mismatches.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "目標交易與 expected 條件不符，已取消修改",
        mismatches,
        current: publicTransaction(row),
      },
      { status: 409 },
    );
  }
  return null;
}

async function loadTargetTransaction(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  target: NonNullable<HermesTransactionCorrectionRequest["target"]>,
) {
  const selectClause =
    "id,user_id,amount,date,category_id,payment_method_id,note,source,source_text,source_id,metadata,created_at,categories(id,name,category_groups(name)),payment_methods(id,name)";

  if (target.transactionId) {
    const { data, error } = await supabase
      .from("transactions")
      .select(selectClause)
      .eq("user_id", userId)
      .eq("source", "hermes")
      .eq("id", target.transactionId)
      .maybeSingle();
    if (error) throw error;
    return (data as TransactionReadRow | null) ?? null;
  }

  if (target.sourceId) {
    const { data, error } = await supabase
      .from("transactions")
      .select(selectClause)
      .eq("user_id", userId)
      .eq("source", "hermes")
      .eq("source_id", target.sourceId)
      .maybeSingle();
    if (error) throw error;
    return (data as TransactionReadRow | null) ?? null;
  }

  if (target.latestHermes) {
    let query = supabase.from("transactions").select(selectClause).eq("user_id", userId).eq("source", "hermes");
    if (target.expectedAmount !== undefined) query = query.eq("amount", target.expectedAmount);
    if (target.expectedDate) query = query.eq("date", target.expectedDate);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(2);
    if (error) throw error;
    const rows = (data ?? []) as TransactionReadRow[];
    if (rows.length === 0) return null;
    if (rows.length > 1 && target.expectedAmount === undefined && !target.expectedDate) {
      throw new Error("latestHermes 目標不夠明確，請加 transactionId、sourceId、expectedAmount 或 expectedDate");
    }
    return rows[0];
  }

  throw new Error("缺少 target.transactionId、target.sourceId 或 target.latestHermes");
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as HermesTransactionRequest;
    const text = body.text?.trim();
    const userId = getUserId(body);

    if (!text) {
      return NextResponse.json({ ok: false, error: "缺少文字內容" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: "缺少 userId 或 LITEYNAB_USER_ID" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const duplicate = await findExistingHermesTransaction(supabase, body.sourceId);

    if (duplicate) {
      return NextResponse.json({ ok: true, duplicate: true, transactionId: duplicate.id });
    }

    const { categories, paymentMethods } = await loadOptions(supabase, userId);

    const parsed = parseHermesTransactionText(text, {
      categories,
      paymentMethods,
      baseDate: body.baseDate || getTodayInTaipei(),
    });

    if (parsed.warnings.length > 0) {
      return NextResponse.json({ ok: false, error: "無法完整解析記帳文字", parsed }, { status: 422 });
    }

    const insertPayload = buildHermesTransactionInsert({
      userId,
      rawText: text,
      parsed,
      sourceId: body.sourceId ?? null,
      context: body.context ?? {},
    });

    const insertResult = await supabase.from("transactions").insert(insertPayload).select("id").single();

    if (insertResult.error) throw insertResult.error;

    return NextResponse.json({
      ok: true,
      transactionId: (insertResult.data as { id: string }).id,
      parsed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hermes transaction entry failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as HermesTransactionCorrectionRequest;
    const userId = getUserId(body);
    const target = body.target;
    const updates = body.updates ?? {};

    if (!userId) {
      return NextResponse.json({ ok: false, error: "缺少 userId 或 LITEYNAB_USER_ID" }, { status: 400 });
    }
    if (!target) {
      return NextResponse.json({ ok: false, error: "缺少 target" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { categories, paymentMethods } = await loadOptions(supabase, userId);
    const category = resolveCategoryByName(categories, updates.category);
    const paymentMethod = resolvePaymentMethodByName(paymentMethods, updates.paymentMethod);

    const updatePayload: Record<string, unknown> = {};
    if (updates.amount !== undefined) {
      if (!Number.isFinite(updates.amount) || updates.amount <= 0) {
        return NextResponse.json({ ok: false, error: "金額必須大於 0" }, { status: 400 });
      }
      updatePayload.amount = updates.amount;
    }
    if (updates.date !== undefined) updatePayload.date = updates.date;
    if (updates.note !== undefined) updatePayload.note = updates.note;
    if (category) updatePayload.category_id = category.id;
    if (paymentMethod) updatePayload.payment_method_id = paymentMethod.id;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ ok: false, error: "缺少 updates" }, { status: 400 });
    }

    const current = await loadTargetTransaction(supabase, userId, target);
    if (!current) {
      return NextResponse.json({ ok: false, error: "找不到目標交易" }, { status: 404 });
    }

    const expectedError = assertExpectedTarget(current, target);
    if (expectedError) return expectedError;

    const correctionMetadata = {
      ...(current.metadata ?? {}),
      hermesCorrection: {
        correctedAt: new Date().toISOString(),
        previous: publicTransaction(current),
        updates: {
          amount: updates.amount ?? null,
          date: updates.date ?? null,
          category: updates.category ?? null,
          paymentMethod: updates.paymentMethod ?? null,
          note: updates.note ?? null,
        },
        context: body.context ?? {},
      },
    };

    let updateQuery = supabase
      .from("transactions")
      .update({ ...updatePayload, metadata: correctionMetadata })
      .eq("id", current.id)
      .eq("user_id", userId)
      .eq("source", "hermes")
      .eq("amount", current.amount)
      .eq("date", current.date)
      .eq("category_id", current.category_id)
      .eq("payment_method_id", current.payment_method_id)
      .eq("note", current.note ?? "");

    if (current.source_id) updateQuery = updateQuery.eq("source_id", current.source_id);

    const updateResult = await updateQuery
      .select(
        "id,user_id,amount,date,category_id,payment_method_id,note,source,source_text,source_id,metadata,created_at,categories(id,name,category_groups(name)),payment_methods(id,name)",
      )
      .maybeSingle();

    if (updateResult.error) throw updateResult.error;
    if (!updateResult.data) {
      return NextResponse.json(
        { ok: false, error: "guarded update 未命中；交易可能已被其他流程修改", current: publicTransaction(current) },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      transactionId: current.id,
      before: publicTransaction(current),
      after: publicTransaction(updateResult.data as TransactionReadRow),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hermes transaction correction failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
