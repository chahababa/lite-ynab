import { createClient } from "@supabase/supabase-js";
import type { CtbcCommand, CtbcInboxData } from "./ctbcInbox";

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
    !Number.isInteger(c.expectedVersion) || Number(c.expectedVersion) < 1 || !["import","link","ignore","defer","work"].includes(String(c.action))) throw new Error("invalid_command");
  for (const key of ["categoryId","paymentId","linkedId"]) if (c[key] != null && (typeof c[key] !== "string" || !uuid.test(c[key] as string))) throw new Error("invalid_command");
  for (const key of ["resolveRisk","batch"]) if (c[key] !== undefined && typeof c[key] !== "boolean") throw new Error("invalid_command");
  return c as CtbcCommand;
}
export async function ctbcLoad(request: Request): Promise<CtbcInboxData> {
  const { client, owner } = await ctbcUserClient(request);
  const [snapshot, categories, payments, transactions] = await Promise.all([
    client.rpc("ctbc_snapshot"), client.from("categories").select("id,name").eq("user_id",owner).order("sort_order"),
    client.from("payment_methods").select("id,name").eq("user_id",owner).order("sort_order"),
    client.from("transactions").select("id,date,amount,note,payment_method_id").eq("user_id",owner).order("date",{ascending:false}).limit(200),
  ]);
  if ([snapshot,categories,payments,transactions].some((r) => r.error)) throw new Error("load_failed");
  return { ...snapshot.data, categories: categories.data ?? [], payments: payments.data ?? [], existing: transactions.data ?? [] };
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
