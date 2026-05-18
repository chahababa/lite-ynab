import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ResetResponse = {
  monthId: string;
  changedBudgets: number;
  trackedAutoCategories: number;
};

function getMonthId(request: Request) {
  const url = new URL(request.url);
  const monthId = url.searchParams.get("monthId");
  return monthId || undefined;
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

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

async function runMonthlyBudgetReset(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const monthId = getMonthId(request);
    const params = monthId ? { p_month_id: monthId } : {};
    const { data, error } = await supabase.rpc("reset_monthly_auto_budgets", params);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, result: data as ResetResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Monthly budget reset failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runMonthlyBudgetReset(request);
}

export async function POST(request: Request) {
  return runMonthlyBudgetReset(request);
}
