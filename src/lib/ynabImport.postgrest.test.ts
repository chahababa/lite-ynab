import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { importYnabPreviewToLiteYnab, type YnabImportPreview } from "./ynabImport";

// Opt-in only in the existing disposable Linux CI Supabase stack. No .env files
// or externally supplied URLs/keys are read; keys come from its local CLI status.
const requested = process.env.S9_LOCAL_POSTGREST === "1";
if (requested && (process.env.GITHUB_ACTIONS !== "true" || process.platform !== "linux")) {
  throw new Error("S9 integration requires the disposable Linux GitHub Actions stack");
}

it.skipIf(!requested)("actual PostgREST honors S8 conflict target, race counts and owner isolation", async () => {
  const cliEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" as const };
  const status = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], { env: cliEnv, encoding: "utf8" }));
  expect(status.API_URL).toBe("http://127.0.0.1:54321");
  const constraint = execFileSync("docker", ["exec", "supabase_db_lite-ynab-local", "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atc",
    "select pg_get_constraintdef(c.oid)||'|'||c.convalidated||'|'||i.indisunique||'|'||i.indisvalid||'|'||i.indisready from pg_constraint c join pg_index i on i.indexrelid=c.conindid where c.conrelid='public.transactions'::regclass and c.conname='transactions_user_source_source_id_key'"], { env: cliEnv, encoding: "utf8" }).trim();
  expect(constraint).toBe("UNIQUE (user_id, source, source_id)|true|true|true|true");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
  const newClient = () => createClient(status.API_URL, status.ANON_KEY, options);
  const setupOwner = async () => {
    const email = `s9-${randomUUID()}@example.invalid`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const client = newClient();
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const group = await client.from("category_groups").insert({ name: "S9 synthetic group" }).select("id").single();
    expect(group.error).toBeNull();
    const category = await client.from("categories").insert({ name: "S9 synthetic category", category_group_id: group.data!.id }).select("id").single();
    const payment = await client.from("payment_methods").insert({ name: "S9 synthetic payment" }).select("id").single();
    expect(category.error).toBeNull();
    expect(payment.error).toBeNull();
    return { client, owner: created.data.user!.id, category: category.data!.id, payment: payment.data!.id };
  };
  const a = await setupOwner();
  const b = await setupOwner();
  const sourceId = `s9-${randomUUID()}`;
  const preview: YnabImportPreview = {
    planId: "synthetic", planName: "Synthetic", groupNames: ["S9 synthetic group"],
    categoryPairs: [{ groupName: "S9 synthetic group", categoryName: "S9 synthetic category" }],
    paymentMethodNames: ["S9 synthetic payment"], sampleTransactions: [], startDate: "2099-02-01", endDate: "2099-02-01",
    transactions: [{ sourceId, date: "2099-02-01", monthId: "2099-02", amount: 123, note: "Synthetic",
      accountName: "S9 synthetic payment", categoryGroupName: "S9 synthetic group", categoryName: "S9 synthetic category" }],
  };
  // Both real HTTP prechecks must complete before either importer can insert.
  let scans = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const writes: Array<{ target: string | null; prefer: string | null; returned: number }> = [];
  const raceFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== status.API_URL) throw new Error("nonlocal request refused");
    const response = await fetch(input, init);
    if (url.pathname === "/rest/v1/transactions" && init?.method === "GET") {
      if (++scans === 2) release();
      await barrier;
    }
    if (url.pathname === "/rest/v1/transactions" && init?.method === "POST") {
      writes.push({ target: url.searchParams.get("on_conflict"), prefer: new Headers(init.headers).get("prefer"), returned: (await response.clone().json()).length });
    }
    return response;
  };
  const raceClient = createClient(status.API_URL, status.ANON_KEY, { ...options, global: { fetch: raceFetch } });
  const session = await a.client.auth.getSession();
  expect((await raceClient.auth.setSession(session.data.session!)).error).toBeNull();
  // Warm month initialization before the deliberately synchronized source race.
  expect((await a.client.rpc("initialize_monthly_budget", { p_month_id: "2099-02" })).error).toBeNull();
  const results = await Promise.all([
    importYnabPreviewToLiteYnab(raceClient, preview), importYnabPreviewToLiteYnab(raceClient, preview),
  ]);
  expect(scans).toBe(2);
  expect(results.map((r) => r.importedTransactionCount).sort()).toEqual([0, 1]);
  expect(results.map((r) => r.skippedDuplicateCount).sort()).toEqual([0, 1]);
  expect(writes.map((r) => r.returned).sort()).toEqual([0, 1]);
  for (const write of writes) {
    expect(write.target).toBe("user_id,source,source_id");
    expect(write.prefer).toContain("resolution=ignore-duplicates");
    expect(write.prefer).toContain("return=representation");
  }
  const rows = async (client: SupabaseClient) => client.from("transactions").select("id,user_id,amount").eq("source", "ynab_import").eq("source_id", sourceId);
  const original = await rows(a.client);
  expect(original.error).toBeNull();
  expect(original.data).toHaveLength(1);
  expect(original.data![0]).toMatchObject({ user_id: a.owner, amount: 123 });
  expect((await rows(b.client)).data).toEqual([]);
  expect((await importYnabPreviewToLiteYnab(b.client, preview)).importedTransactionCount).toBe(1);
  expect((await rows(b.client)).data).toHaveLength(1);
  expect((await rows(a.client)).data).toEqual(original.data);
  const replay = await a.client.from("transactions").upsert({
    date: "2099-02-01", amount: 999, category_id: a.category, payment_method_id: a.payment, source: "ynab_import", source_id: sourceId,
  }, { onConflict: "user_id,source,source_id", ignoreDuplicates: true }).select("id");
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual([]);
  expect((await rows(a.client)).data).toEqual(original.data);
}, 60_000);
