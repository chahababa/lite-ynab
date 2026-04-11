import { NextResponse } from "next/server";

import type {
  YnabAccount,
  YnabCategory,
  YnabCategoryGroup,
  YnabPlan,
  YnabTransaction,
} from "@/lib/ynabImport";

const YNAB_API_BASE_URL = "https://api.ynab.com/v1";

type YnabRouteRequest =
  | {
      action: "listPlans";
      token: string;
    }
  | {
      action: "loadPlan";
      token: string;
      planId: string;
    };

type YnabApiError = {
  error?: {
    detail?: string;
    name?: string;
  };
};

async function fetchYnab<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${YNAB_API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `YNAB API 回傳 ${response.status}`;

    try {
      const body = (await response.json()) as YnabApiError;
      detail = body.error?.detail || body.error?.name || detail;
    } catch {
      // ignore parse error and keep fallback message
    }

    throw new Error(detail);
  }

  return (await response.json()) as T;
}

function normalizeCategoryGroups(
  groups: Array<{
    id: string;
    name: string;
    hidden?: boolean;
    deleted?: boolean;
    categories?: Array<{
      id: string;
      category_group_id?: string;
      name: string;
      hidden?: boolean;
      deleted?: boolean;
    }>;
  }>,
) {
  const normalizedGroups: YnabCategoryGroup[] = [];
  const normalizedCategories: YnabCategory[] = [];

  for (const group of groups) {
    normalizedGroups.push({
      id: group.id,
      name: group.name,
      hidden: group.hidden,
      deleted: group.deleted,
    });

    for (const category of group.categories ?? []) {
      normalizedCategories.push({
        id: category.id,
        category_group_id: category.category_group_id ?? group.id,
        category_group_name: group.name,
        name: category.name,
        hidden: category.hidden,
        deleted: category.deleted,
      });
    }
  }

  return {
    categoryGroups: normalizedGroups,
    categories: normalizedCategories,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<YnabRouteRequest>;
    const token = body.token?.trim();

    if (!token) {
      return NextResponse.json({ error: "請先貼上 YNAB Personal Access Token" }, { status: 400 });
    }

    if (body.action === "listPlans") {
      const plansResponse = await fetchYnab<{ data: { plans: YnabPlan[] } }>("/plans", token);

      return NextResponse.json({
        plans: plansResponse.data.plans,
      });
    }

    if (body.action === "loadPlan") {
      const planId = body.planId?.trim();

      if (!planId) {
        return NextResponse.json({ error: "請先選擇要匯入的 YNAB 計畫" }, { status: 400 });
      }

      const [planResponse, accountsResponse, categoriesResponse, transactionsResponse] = await Promise.all([
        fetchYnab<{ data: { plan: YnabPlan } }>(`/plans/${planId}`, token),
        fetchYnab<{ data: { accounts: YnabAccount[] } }>(`/plans/${planId}/accounts`, token),
        fetchYnab<{
          data: {
            category_groups: Array<{
              id: string;
              name: string;
              hidden?: boolean;
              deleted?: boolean;
              categories?: Array<{
                id: string;
                category_group_id?: string;
                name: string;
                hidden?: boolean;
                deleted?: boolean;
              }>;
            }>;
          };
        }>(`/plans/${planId}/categories`, token),
        fetchYnab<{ data: { transactions: YnabTransaction[] } }>(`/plans/${planId}/transactions`, token),
      ]);

      const normalizedCategories = normalizeCategoryGroups(categoriesResponse.data.category_groups);

      return NextResponse.json({
        plan: planResponse.data.plan,
        accounts: accountsResponse.data.accounts,
        categoryGroups: normalizedCategories.categoryGroups,
        categories: normalizedCategories.categories,
        transactions: transactionsResponse.data.transactions,
      });
    }

    return NextResponse.json({ error: "不支援的 YNAB 動作" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法讀取 YNAB 資料";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
