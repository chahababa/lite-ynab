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

type HermesCategoryRow = {
  id: string;
  name: string;
  category_groups?: { name: string | null } | { name: string | null }[] | null;
};

function normalizeHermesCategories(rows: HermesCategoryRow[]) {
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

function getUserId(body: HermesTransactionRequest) {
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

    const parsed = parseHermesTransactionText(text, {
      categories: normalizeHermesCategories((categoriesResult.data ?? []) as HermesCategoryRow[]),
      paymentMethods: (paymentMethodsResult.data ?? []) as Pick<PaymentMethod, "id" | "name">[],
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
