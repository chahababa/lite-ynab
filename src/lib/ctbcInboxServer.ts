import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { pickAutoImports, type CtbcAutoImported, type CtbcAutoResult, type CtbcAutoRule } from "./ctbcAutoRules";
import type { CtbcCandidate, CtbcCommand, CtbcInboxData } from "./ctbcInbox";

export function ctbcEnabled() { return process.env.CTBC_INBOX_ENABLED === "true"; }
export async function ctbcUserClient(request: Request) {
  if (!ctbcEnabled()) throw new Error("disabled");
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !token) throw new Error("unauthorized");
  if (process.env.CTBC_INBOX_TEST_MODE === "true" && new URL(url).origin !== "http://127.0.0.1:54321") throw new Error("invalid_test_target");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user) throw new Error("unauthorized");
  return { client, owner: user.data.user.id };
}
export function ctbcValidateCommand(value: unknown): CtbcCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_command");
  const c = value as Record<string, unknown>;
  const keys = ["candidateId","expectedVersion","action","actionKey","categoryId","paymentId","linkedId","resolveRisk","batch"];
  if (Object.keys(c).some((key) => !keys.includes(key))) throw new Error("invalid_command");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof c.candidateId !== "string" || !uuid.test(c.candidateId) || typeof c.actionKey !== "string" || !uuid.test(c.actionKey) ||
    !Number.isInteger(c.expectedVersion) || Number(c.expectedVersion) < 1 || typeof c.action !== "string" || !["import","link","ignore","defer","work"].includes(c.action)) throw new Error("invalid_command");
  for (const key of ["categoryId","paymentId","linkedId"]) if (c[key] != null && (typeof c[key] !== "string" || !uuid.test(c[key] as string))) throw new Error("invalid_command");
  for (const key of ["resolveRisk","batch"]) if (c[key] !== undefined && typeof c[key] !== "boolean") throw new Error("invalid_command");
  return c as CtbcCommand;
}
export async function ctbcLoad(request: Request): Promise<CtbcInboxData> {
  const { client, owner } = await ctbcUserClient(request);
  const [snapshot, groups, categories, payments, transactions] = await Promise.all([
    client.rpc("ctbc_snapshot"), client.from("category_groups").select("id,name,sort_order").eq("user_id",owner),
    client.from("categories").select("id,name,sort_order,category_group_id").eq("user_id",owner).order("sort_order"),
    client.from("payment_methods").select("id,name").eq("user_id",owner).order("sort_order"),
    client.from("transactions").select("id,date,amount,note,payment_method_id,category_id").eq("user_id",owner).order("date",{ascending:false}).limit(200),
  ]);
  if ([snapshot,groups,categories,payments,transactions].some((r) => r.error)) throw new Error("load_failed");
  // 分類照「大項 → 分類」排序，並帶上大項名稱（畫面用顏色區分大項）
  const groupById = new Map((groups.data ?? []).map((g) => [g.id as string, g as { name: string; sort_order: number }]));
  const sortedCategories = (categories.data ?? [])
    .map((c) => ({ id: c.id as string, name: c.name as string, groupName: groupById.get(c.category_group_id)?.name ?? "", groupOrder: groupById.get(c.category_group_id)?.sort_order ?? 0, order: c.sort_order as number }))
    .sort((a, b) => a.groupOrder - b.groupOrder || a.order - b.order)
    .map(({ id, name, groupName }) => ({ id, name, groupName }));
  return { ...snapshot.data, categories: sortedCategories, payments: payments.data ?? [], existing: transactions.data ?? [] };
}
export async function ctbcApply(request: Request, value: unknown) {
  const c = ctbcValidateCommand(value);
  const { client } = await ctbcUserClient(request);
  const result = await client.rpc("ctbc_act", { p_id:c.candidateId,p_expected:c.expectedVersion,p_action:c.action,p_key:c.actionKey,
    p_category:c.categoryId ?? null,p_payment:c.paymentId ?? null,p_link:c.linkedId ?? null,p_resolve:c.resolveRisk ?? false,p_batch:c.batch ?? false });
  if (result.error || result.data?.code === "risk_recheck_required") throw new Error("action_conflict");
  return result.data;
}

export async function ctbcApplyBatch(request:Request,value:unknown){
  if(!Array.isArray(value)||value.length<1||value.length>20)throw new Error("invalid_command");
  const commands=value.map(ctbcValidateCommand);
  const first=commands[0];
  if(commands.some((c)=>c.action!=="import"||c.batch!==true||!c.categoryId||!c.paymentId||c.categoryId!==first.categoryId||c.paymentId!==first.paymentId)||
    new Set(commands.map((c)=>c.candidateId)).size!==commands.length||new Set(commands.map((c)=>c.actionKey)).size!==commands.length)throw new Error("invalid_command");
  const {client}=await ctbcUserClient(request);
  const preflight=await client.rpc("ctbc_batch_preflight",{p_commands:commands});
  if(preflight.error||preflight.data?.code!=="ready")throw new Error("action_conflict");
  const results:Array<{candidateId:string;status:"success"|"conflict"|"not_submitted"}>=[];
  let stopped=false;
  for(const c of commands){
    if(stopped){results.push({candidateId:c.candidateId,status:"not_submitted"});continue;}
    try{await ctbcApply(request,c);results.push({candidateId:c.candidateId,status:"success"});}
    catch{results.push({candidateId:c.candidateId,status:"conflict"});stopped=true;}
  }
  return {results};
}

/**
 * 依使用者設定的「自動歸類規則」，把乾淨的待確認刷卡直接補記。
 * 走的是跟手動補記完全一樣的 ctbc_act('import')：風險複查、版本檢查、防重複都照舊；
 * 任何一筆被擋下（例如剛好變成可能重複）就留在待確認，不影響其他筆。
 */
export async function ctbcAutoImport(request: Request): Promise<CtbcAutoResult> {
  const { client, owner } = await ctbcUserClient(request);
  const rules = await client.from("ctbc_auto_rules").select("id,pattern,category_id,max_amount,enabled").eq("user_id", owner);
  // 規則表讀不到（例如資料庫還沒建這張表）就當作沒有規則，不影響原本的待確認流程。
  if (rules.error || !rules.data || rules.data.length === 0) return { imported: [] };

  const [snapshot, categories] = await Promise.all([
    client.rpc("ctbc_snapshot"),
    client.from("categories").select("id,name").eq("user_id", owner),
  ]);
  if (snapshot.error || categories.error) throw new Error("load_failed");

  const categoryName = new Map((categories.data ?? []).map((c) => [c.id as string, c.name as string]));
  const picked = pickAutoImports((snapshot.data?.candidates ?? []) as CtbcCandidate[], rules.data as CtbcAutoRule[])
    .filter(({ rule }) => categoryName.has(rule.category_id));

  const imported: CtbcAutoImported[] = [];
  for (const { candidate, rule } of picked) {
    const result = await client.rpc("ctbc_act", { p_id: candidate.id, p_expected: candidate.version, p_action: "import", p_key: randomUUID(),
      p_category: rule.category_id, p_payment: candidate.suggested_payment_id, p_link: null, p_resolve: false, p_batch: false });
    if (result.error || result.data?.code !== "personal_imported") continue;
    imported.push({ merchant: candidate.merchant ?? "", amount: candidate.amount ?? 0, categoryName: categoryName.get(rule.category_id) ?? "" });
  }
  return { imported };
}
