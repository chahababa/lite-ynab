# Lite YNAB Safety Foundation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close six safety prerequisites—category archival without history loss, tenant-safe references and service-role access, atomic multi-row writes, spreadsheet formula sanitization, concurrency-safe idempotency, and reproducible install/CI—before Option B travel-domain implementation.

**Architecture:** Put invariants at the lowest enforceable boundary: PostgreSQL for ownership, referential integrity, archival, atomicity, and uniqueness; shared pure TypeScript adapters for export safety; explicit tenant arguments for every service-role read/write; and deterministic package/CI inputs for verification. Repository implementation, production migration apply, runtime rollout, and product-feature work stay as separate gates so no merge silently becomes production database authorization.

**Tech Stack:** Next.js 15.5, TypeScript, React 19, Vitest, Supabase/PostgreSQL with RLS and PL/pgSQL, Google Sheets API, GitHub Actions, Docker/Zeabur.

---

## 0. Scope, authority, and hard stops

This plan was grounded at `origin/main` commit `e750d1273ae3e24d557739079fc8d849cbf187dc` on 2026-09-16. It is a Tier 0 planning artifact only. The examples below are future implementation instructions inside Markdown; this plan does not execute them.

During plan preparation Matt selected Option A in `t_34ba1232`; concept maturity is now 5. The separate Tier 0 addendum from `t_a89826d8` is merged at current main commit `e750d12`. The safety sequence below remains independent of the four resolved product semantics and must not reopen or absorb that addendum's work.

Non-goals preserved from the product SPEC:

- no account ledger or bank-balance model;
- no Ready to Assign;
- no reconciliation or net-worth model;
- no FX;
- no payment splitting;
- no automatic travel classification;
- no transaction splits;
- no travel-event schema, travel UI, or Option B feature in a safety-foundation slice.

Canonical hard stops:

1. A repository migration commit is not permission to run it against production.
2. Every production DB/schema/RLS/data preflight or apply is a separate Tier 2 action and requires a Matt exact-scope grant naming the migration, target project, preflight result, backup/rollback or forward-fix, and expected effect.
3. Never combine a production migration apply with repository implementation, PR review, or merge.
4. Stop on duplicate-source preflight rows, cross-owner rows, unknown FK names, migration drift, failed current-head CI, merge conflict, unknown deploy trigger, missing rollback/forward-fix, or any unlisted product choice.
5. No secrets, `.env`, OAuth, Supabase keys, production data, deploy/restart, force-push, destructive cleanup, or migration execution is authorized by this document.
6. Tier 2 review follows D-021: one isolated GPT-5.6-sol adversarial evidence context and a distinct GPT-5.6-sol formal review context; formal review must independently read the exact head, diff, tests, and migration evidence.
7. Any frontend slice requires UX QA after technical QA. UX QA verifies the user-visible flow; it does not replace security/data review.

## 1. Current-main evidence inventory

### 1.1 What is already satisfied

| Control | Current evidence | What is genuinely satisfied |
|---|---|---|
| Row ownership/RLS | `supabase/migrations/202604020001_init_lite_ynab.sql:84-171`; `202604030004_add_budget_planning_groups_and_payment_methods.sql:116-159` | Existing core tables have own-row RLS policies for select/insert/update/delete. |
| Cross-owner transaction/budget references | `supabase/migrations/20260703120000_enforce_reference_ownership.sql:9-80` | Database triggers reject transaction→category/payment-method and budget→category references whose `user_id` differs, including service-role writes. |
| Transactional SQL precedent | `supabase/migrations/202607030001_month_init_income_carry_no_backfill.sql:8-60`; duplicate-rent helper migrations | Existing PL/pgSQL functions demonstrate that a single RPC can execute multiple statements in one database transaction. This is a reusable pattern, not yet a complete application-wide control. |
| Source metadata and best-effort dedupe | `supabase/migrations/202605180002_add_transaction_source_fields.sql:3-29`; `src/lib/ynabImport.ts:470-568`; `src/app/api/hermes/transactions/route.ts:109-123,304-333`; associated tests | Transactions have `source`/`source_id`; Hermes and YNAB perform pre-insert duplicate checks; unit tests cover ordinary retries. |
| CI exists | `.github/workflows/ci.yml:1-47`; GitHub run `35080909824` | Current main commit `e750d12…` has a green workflow running test, typecheck, and build with read-only permissions. |
| Lockfile exists | `package-lock.json:1-36` | A v3 lockfile is committed and its root direct dependencies match the manifest. Presence alone does not make installation reproducible. |

### 1.2 Real gaps, without relying on the merged SPEC's assessment

| Prerequisite | Status | Current-main evidence and consequence |
|---|---|---|
| Category archive / no cascade history deletion | **Gap** | `budgets.category_id` and `transactions.category_id` use `on delete cascade` (`202604020001_init_lite_ynab.sql:36-55`); `categories.category_group_id` also cascades (`202604030004...sql:21-25`). The UI intentionally hard-deletes categories/groups and warns that history is removed (`BudgetAllocationPageClient.tsx:383-415,557-587`). A runtime legacy normalizer also deletes categories after several non-atomic updates (`src/lib/data.ts:209-410`). |
| Tenant ownership/RLS and cross-user references | **Partial** | Core RLS and transaction/budget ownership triggers exist. Missing: category→category-group and `budget_auto_adjustment_stats`→category owner enforcement; the stats FK still cascades category deletion (`202605180001_monthly_auto_budget_reset.sql:3-16`); service-role monthly-report reads may omit `user_id` on dry-run (`monthlyExpenseReportServer.ts:24-34,48-108`, both cron routes); Hermes duplicate lookup is not tenant-scoped (`route.ts:109-123`). The global monthly reset RPC updates all users (`202605180001_monthly_auto_budget_reset.sql:91-159`). No dynamic SQL test proves the existing ownership triggers. |
| Atomic batch writes | **Partial** | SQL RPC precedent is atomic, but category+budget creation is two client calls (`BudgetAllocationPageClient.tsx:417-456`), batch budget updates are `Promise.all` calls (`539-546,698-787`), and YNAB import performs dimensions, month initialization, then 200-row chunks (`ynabImport.ts:308-577`). A later failure can leave partial state. |
| Spreadsheet formula sanitization | **Gap** | Transaction CSV only quotes delimiters (`transactions/page.tsx:38-60,254-270`); reports CSV quotes text and HTML `.xls` interpolates raw cells (`reports/page.tsx:28-83`); Google Sheets sends user-derived strings with `valueInputOption=USER_ENTERED` (`googleSheetsMonthlyExport.ts:52-166,255-267`). No formula-injection test exists. |
| Idempotency | **Partial** | The source index is non-unique (`202605180002...sql:24-29`). Check-then-insert in Hermes and YNAB is race-prone, and Hermes lookup omits `user_id`. Ordinary duplicate tests (`route.test.ts:282-297`; `ynabImport.test.ts:262-280`) do not model concurrent requests or database uniqueness. |
| Reproducible package install / CI | **Gap** | `npm ci --ignore-scripts --no-audit --no-fund` fails at current main: missing `@emnapi/runtime@1.11.3`, missing `@emnapi/core@1.11.3`, and invalid `@emnapi/wasi-threads`. CI works around the lock with `npm install ... --no-package-lock --no-save` (`ci.yml:32-38`). Docker also uses `npm install` (`Dockerfile:1-10`). CI omits lint, and `npm run lint` enters an interactive Next.js setup because no ESLint config is committed. |

### 1.3 Safety completion definition

The foundation is complete only when all of these statements have evidence:

- A category/group archive operation cannot delete historical transactions or budgets; hard delete is database-blocked.
- Active selectors omit archived categories, while historic transactions/reports retain archived names and links.
- Every service-role operation has an explicit tenant scope, unless a separately documented global maintenance function deliberately enumerates owners and is tested as such.
- Every cross-owner reference covered by the current schema is rejected at the database boundary, including category→group and adjustment-stat→category.
- Every multi-entity or multi-row money/data write named in this plan commits all rows or none.
- Every CSV, HTML-XLS, and Google Sheets export path applies one shared formula-sanitization rule to user-controlled strings.
- `(user_id, source, source_id)` is database-unique for non-null `source_id`, and retry behavior is correct under a uniqueness race.
- `npm ci`, non-interactive lint, tests, typecheck, and build run from the committed package graph in CI; Docker uses the same clean-install contract.

## 2. Slice map and dependencies

Do not create all cards at once. PMO should release one repository slice only after the prior slice's current-head gate passes. Production apply rows remain separate hard-stop cards.

| Slice | Deliverable | Tier | Depends on | Production boundary |
|---|---|---:|---|---|
| S1 | Fail-closed trusted tenant binding for every Hermes operation plus report reads | 2 | None technically; PMO sequencing places it after the independent SPEC addendum | Repository code only; merge may auto-deploy, so release gate verifies deployment policy. No DB change. |
| S2 | Reproducible package graph, headless lint, CI clean install, Docker clean install | 2 | S1 current-head gate | Repository/infra only; Docker/package merge may auto-deploy. No DB change. |
| S3 | Shared formula-safe spreadsheet export adapter across CSV/XLS/Sheets | 1 | S2 | Repository code only; frontend UX QA required; merge may auto-deploy. |
| S4 | Local/CI Supabase migration test harness | 2 | S2 | Local ephemeral DB only. Remote Supabase commands forbidden. |
| S4A | Replace global monthly-reset RPC with a required tenant argument | 2 | S4 | Repository migration only. **Do not apply in this slice.** |
| S4A-PROD | Exact-scope production apply of S4A | 2 | S4A merged, backup/preflight/review/QA/release | Separate Matt grant required; removal of the no-argument RPC fails closed until S4B. |
| S4B | Pass trusted tenant binding from monthly-reset route | 2 | S4A-PROD verified | Repository runtime code only; no DB change or env change in the card. |
| S5 | Remove runtime destructive legacy category normalization | 2 | S4 | Repository code only; no data rewrite. Merge may auto-deploy. |
| S6 | Category archive, RESTRICT history FKs, active-parent invariant, archive-aware initializer/reset, and remaining cross-owner reference protections | 2 | S4, S4B, S5 | Repository migration only. **Do not apply in this slice.** |
| S6-PROD | Exact-scope production apply of S6 | 2 | S6 merged, backup/preflight/review/QA/release | Separate Matt grant required; no repository edits. |
| S7 | Archive-aware application behavior and UX | 2 | S6-PROD verified | Runtime code writes `archived_at`; technical QA + UX QA; no migration apply. |
| S8 | Database uniqueness for transaction source identity | 2 | S4; S6 may run before or after, but never concurrently | Repository migration only. **Do not apply in this slice.** |
| S8-PROD | Exact-scope production apply of S8 | 2 | S8 merged and duplicate preflight returns zero | Separate Matt grant required; no repository edits. |
| S9 | Concurrency-safe Hermes and YNAB retry handling | 2 | S8-PROD verified | Runtime code only; merge may auto-deploy. |
| S10 | Atomic category+budget and budget-batch RPC migration | 2 | S4, S6-PROD | Repository migration only. **Do not apply in this slice.** |
| S10-PROD | Exact-scope production apply of S10 | 2 | S10 merged and preflight/review complete | Separate Matt grant required; no repository edits. |
| S11 | Switch current category and budget batch callers to atomic RPCs | 2 | S10-PROD verified | Runtime code only; frontend UX QA required. |
| S12 | Atomic, retry-safe YNAB import RPC | 2 | S8-PROD, S10 patterns established | Repository migration first, separate production apply, then runtime switch; use the same three-card boundary as S10. |

The Tier 0 SPEC addendum is already merged at current main. S1 is therefore the smallest immediately selectable plan-grounded Tier 2 repository slice; it closes an existing service-role cross-tenant read/write risk without schema or product semantics.

## 3. S1 — Fail-closed tenant scope for service-role access

**Risk:** Tier 2 — service-role/auth boundary.

**Objective:** No monthly-report query or Hermes read/write can select its tenant from request data or cross users when RLS is bypassed.

**Files:**

- Modify: `src/lib/monthlyExpenseReportServer.ts:24-108`
- Modify: `src/app/api/cron/monthly-expense-report/route.ts:41-64`
- Modify: `src/app/api/cron/monthly-expense-report/sheets/route.ts:34-63`
- Modify: `src/app/api/hermes/transactions/route.ts:105-123,286-331,346-447`
- Test: `src/app/api/cron/monthly-expense-report/route.test.ts:96-138`
- Test: `src/app/api/cron/monthly-expense-report/sheets/route.test.ts:121-179`
- Test: `src/app/api/hermes/transactions/route.test.ts:282-297`
- Create test: `src/lib/monthlyExpenseReportServer.test.ts`

### Task 3.1: Write failing tenant-scope tests

Add route tests that require `LITEYNAB_USER_ID` even for dry-run. Replace the current permissive dry-run expectation with:

```ts
it("rejects dry runs without explicit tenant scope", async () => {
  delete process.env.LITEYNAB_USER_ID;
  const { GET } = await import("./route");

  const response = await GET(
    new Request("https://lite-ynab.test/api/cron/monthly-expense-report?monthId=2026-04&dryRun=1&includeReport=1", {
      headers: { Authorization: "Bearer secret" },
    }),
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    ok: false,
    error: "Missing LITEYNAB_USER_ID; monthly report requires explicit tenant scope",
  });
  expect(mocks.fetchMonthlyExpenseReport).not.toHaveBeenCalled();
});
```

Add the corresponding Sheets-route test. Add Hermes POST and PATCH tests that prove:

- missing `LITEYNAB_USER_ID` fails before any Supabase call;
- request `body.userId` is never authoritative;
- a mismatching `body.userId` is rejected with 403 rather than overriding the configured tenant;
- duplicate lookup and every mutation use the trusted configured tenant.

Run:

```bash
npm test -- src/app/api/cron/monthly-expense-report/route.test.ts src/app/api/cron/monthly-expense-report/sheets/route.test.ts src/app/api/hermes/transactions/route.test.ts
```

Expected red result: dry-run tests receive 200, the Hermes duplicate builder has no `user_id` predicate, and `getUserId` accepts caller-controlled `body.userId` when the environment binding is absent.

### Task 3.2: Make monthly reports require a tenant

Use one required options object; do not leave an optional fallback that can silently produce an unscoped service-role query. Putting the required tenant inside one object also avoids an invalid TypeScript signature with a required parameter after defaulted parameters.

```ts
export async function fetchMonthlyExpenseReport({
  userId: rawUserId,
  supabase = createMonthlyReportServiceClient(),
  monthId = getPreviousMonthIdInTaipei(),
}: {
  userId: string;
  supabase?: SupabaseClient;
  monthId?: string;
}): Promise<MonthlyExpenseReport> {
  const userId = rawUserId.trim();
  if (!userId) throw new Error("Monthly report requires explicit tenant scope");
  // existing flow, now with a required userId
}

function filterByUser<T extends { eq: (column: string, value: string) => T }>(query: T, userId: string): T {
  return query.eq("user_id", userId);
}
```

Both cron routes must reject missing `LITEYNAB_USER_ID` before fetching, regardless of `dryRun`, then call `fetchMonthlyExpenseReport({ userId, monthId })`.

### Task 3.3: Make Hermes tenant binding trusted and scope every path

Replace the `LITEYNAB_USER_ID ?? body.userId` fallback with a fail-closed resolver. Apply it before both POST and PATCH Supabase access. Add a small local status-bearing error because current route catches otherwise flatten every exception to 500.

```ts
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function getTrustedUserId(bodyUserId: unknown): string {
  const configuredUserId = process.env.LITEYNAB_USER_ID?.trim();
  if (!configuredUserId) {
    throw new HttpError(500, "Missing LITEYNAB_USER_ID; Hermes API requires a trusted tenant binding");
  }
  if (typeof bodyUserId === "string" && bodyUserId.trim() && bodyUserId.trim() !== configuredUserId) {
    throw new HttpError(403, "userId does not match the configured tenant");
  }
  return configuredUserId;
}
```

In both POST and PATCH catches, preserve only this explicit status and keep unknown errors at 500:

```ts
} catch (error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Hermes transaction operation failed";
  return NextResponse.json({ ok: false, error: message }, { status });
}
```

Do not return a request-supplied ID. Existing clients may continue sending the same ID for compatibility, but it is only a consistency assertion and must never select the tenant. Apply `.eq("user_id", userId)` to every Hermes read/update/delete lookup as well as the duplicate readback.

```ts
async function findExistingHermesTransaction(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  sourceId: string | null | undefined,
) {
  if (!sourceId) return null;

  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "hermes")
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string } | null) ?? null;
}
```

Call with `findExistingHermesTransaction(supabase, userId, body.sourceId)` after resolving the trusted tenant. Search POST and PATCH for every `.from(...)` call and add a test asserting each resulting query/mutation is tenant constrained.

### Task 3.4: Verify, review, and commit

Run:

```bash
npm test -- src/app/api/cron/monthly-expense-report/route.test.ts src/app/api/cron/monthly-expense-report/sheets/route.test.ts src/app/api/hermes/transactions/route.test.ts src/lib/monthlyExpenseReportServer.test.ts
npm test
npm run typecheck
npm run build
```

Expected: targeted and full suites pass; typecheck/build exit 0. Lint remains a known S2 gap and is not waived silently.

Commit point:

```bash
git add src/lib/monthlyExpenseReportServer.ts src/lib/monthlyExpenseReportServer.test.ts src/app/api/cron/monthly-expense-report src/app/api/hermes/transactions

git commit -m "fix: require tenant scope for service-role reads"
```

Rollback/forward-fix: revert the runtime commit. Do not relax tenant scope as a quick fix; correct missing deployment configuration through a separately authorized env operation.

Gate/hard stop: distinct Tier 2 adversarial and formal review contexts. Stop if any Hermes or report service-role query/mutation can execute without trusted `user_id`, if `body.userId` can select a tenant, or if deployment lacks `LITEYNAB_USER_ID`; env changes are not part of this slice.

## 4. S2 — Reproducible package install and CI

**Risk:** Tier 2 — `.github/workflows/**` and `Dockerfile` are deterministic T2 tripwires.

**Objective:** Replace the successful-but-nonreproducible install workaround with a committed clean-install graph and non-interactive quality gates.

**Files:**

- Modify: `package.json:5-38`
- Modify: `package-lock.json`
- Create: `eslint.config.mjs`
- Modify: `.github/workflows/ci.yml:18-47`
- Modify: `Dockerfile:1-10`

### Task 4.1: Preserve the current red evidence

Run from a clean worktree:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

Expected red result at baseline: `EUSAGE` with missing `@emnapi/runtime@1.11.3`, missing `@emnapi/core@1.11.3`, and invalid `@emnapi/wasi-threads`.

Run:

```bash
npm run lint
```

Expected red result at baseline: Next.js starts an interactive ESLint configuration prompt and exits nonzero in headless execution.

### Task 4.2: Regenerate the package graph deliberately

Use the resolved Next major and explicit test peer; do not hand-edit the lockfile.

```bash
npm install --save-dev @testing-library/dom@10.4.1 eslint@9 eslint-config-next@15.5.14
```

Set scripts:

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Create `eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]),
]);
```

Run `git diff -- package.json package-lock.json` and confirm the lock root contains all direct dependencies and no unrelated dependency churn beyond npm's required resolution.

### Task 4.3: Make CI and Docker clean-install consumers

Replace the CI install workaround with:

```yaml
- name: Install dependencies
  run: npm ci --no-audit --no-fund

- name: Lint
  run: npm run lint
```

Keep test, typecheck, and build. In Docker, align with CI's Node major and use clean install:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
```

Do not add secrets or deployment commands.

### Task 4.4: Verify and commit

Run from a clean dependency state:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm test
npm run typecheck
npm run build
```

Expected: every command exits 0 without prompts; `git diff --exit-code -- package.json package-lock.json` is run only after committing or against a saved expected diff, not as a claim that implementation changed nothing.

Optional container parity check if Docker is available:

```bash
docker build --target builder -t lite-ynab:safety-ci .
```

Expected: image build reaches `npm run build`. Lack of local Docker is reported as unverified, not silently treated as pass; GitHub CI remains mandatory.

Commit:

```bash
git add package.json package-lock.json eslint.config.mjs .github/workflows/ci.yml Dockerfile

git commit -m "build: restore reproducible install and quality gates"
```

Rollback: revert the commit. Forward-fix: correct the lock or lint config in a narrow PR; never restore `npm install --no-package-lock` as a permanent green-build workaround.

Release boundary: merge may trigger Zeabur because package/Docker inputs changed. Release must read deployment configuration, current-head CI, and rollback path before merge. No restart or deploy is authorized by this plan.

## 5. S3 — Formula-safe spreadsheet exports

**Risk:** Tier 1 — reversible application code, no schema/auth/env; frontend UX QA required.

**Objective:** Apply one testable sanitization rule to every user-controlled string written to CSV, HTML-XLS, or Google Sheets.

**Files:**

- Create: `src/lib/spreadsheetSafety.ts`
- Create: `src/lib/spreadsheetSafety.test.ts`
- Modify: `src/app/transactions/page.tsx:38-60,254-270`
- Modify: `src/app/transactions/page.test.tsx`
- Modify: `src/app/reports/page.tsx:28-83`
- Modify: `src/app/reports/page.test.tsx`
- Modify: `src/lib/googleSheetsMonthlyExport.ts:52-166`
- Modify: `src/lib/googleSheetsMonthlyExport.test.ts:80-124`

### Task 5.1: Write the failing pure-function tests

```ts
import { describe, expect, it } from "vitest";
import { sanitizeSpreadsheetValue, toCsvCell, toHtmlTableCell } from "./spreadsheetSafety";

describe("spreadsheet export safety", () => {
  it.each([
    "=1+1",
    "+SUM(A1:A2)",
    "-2+3",
    "@IMPORTXML(\"https://evil.test\")",
    " =1+1",
    "\t=1+1",
    "\r\n@SUM(A1:A2)",
    "\u00a0+1",
    "\ufeff-1",
  ])(
    "neutralizes formula-capable text %j",
    (value) => expect(sanitizeSpreadsheetValue(value)).toBe(`'${value}`),
  );

  it("leaves numbers and ordinary text unchanged", () => {
    expect(sanitizeSpreadsheetValue(1200)).toBe(1200);
    expect(sanitizeSpreadsheetValue("早餐")).toBe("早餐");
  });

  it("quotes CSV after formula neutralization", () => {
    expect(toCsvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });

  it("escapes HTML after formula neutralization", () => {
    expect(toHtmlTableCell("=<script>alert(1)</script>")).toBe("&#39;=&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
```

Run:

```bash
npm test -- src/lib/spreadsheetSafety.test.ts
```

Expected red result: module not found.

### Task 5.2: Add the minimal shared implementation

```ts
export type SpreadsheetValue = string | number | boolean | null;

const FORMULA_AFTER_OPTIONAL_WHITESPACE = /^[\s\ufeff]*[=+\-@]/u;

export function sanitizeSpreadsheetValue(value: SpreadsheetValue): SpreadsheetValue {
  if (typeof value !== "string") return value;
  return FORMULA_AFTER_OPTIONAL_WHITESPACE.test(value) ? `'${value}` : value;
}

export function toCsvCell(value: SpreadsheetValue): string {
  const text = String(sanitizeSpreadsheetValue(value) ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export function toHtmlTableCell(value: SpreadsheetValue): string {
  return String(sanitizeSpreadsheetValue(value) ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

### Task 5.3: Route all export adapters through the helper

- Replace both page-local CSV helpers with `toCsvCell`.
- Use `toHtmlTableCell` for every HTML-XLS `<td>` value.
- In `buildGoogleSheetsMonthlyExportTables`, sanitize every row cell just before returning the tables; numeric values remain numeric.
- Do not switch Google Sheets to `RAW` as a substitute: callers may still export CSV/XLS, and one shared rule is easier to audit.

Add malicious fixtures to page and Sheets tests using category/group/payment names and notes beginning with each dangerous prefix, including leading ASCII space, tab, CR/LF, non-breaking space, and BOM. Preserve the original text after the leading apostrophe; do not trim user content. Assert the serialized Blob/table contains an apostrophe prefix and ordinary numbers remain numbers.

### Task 5.4: Verify and commit

```bash
npm test -- src/lib/spreadsheetSafety.test.ts src/lib/googleSheetsMonthlyExport.test.ts src/app/transactions/page.test.tsx src/app/reports/page.test.tsx
npm test
npm run lint
npm run typecheck
npm run build
```

Commit:

```bash
git add src/lib/spreadsheetSafety.ts src/lib/spreadsheetSafety.test.ts src/lib/googleSheetsMonthlyExport.ts src/lib/googleSheetsMonthlyExport.test.ts src/app/transactions src/app/reports

git commit -m "fix: sanitize spreadsheet export cells"
```

Rollback: revert the helper and call sites together. Forward-fix: add a new dangerous prefix only in the shared helper plus a regression fixture.

UX QA: download CSV and `.xls` from Transactions and Reports with a synthetic `=1+1` note/category, and dry-run the Sheets table. Confirm files open, ordinary Traditional Chinese text is unchanged, dangerous text displays literally, and no formula executes.

## 6. S4 — Local and CI migration verification harness

**Risk:** Tier 2 — database tooling and CI workflow; local ephemeral database only.

**Objective:** Make ownership, FK, archival, uniqueness, and atomicity assertions executable before any repository migration can be considered ready.

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/tests/000_smoke.test.sql`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md` only if one short local-test command is otherwise undiscoverable

### Task 6.1: Prove the harness is absent, then initialize without a remote link

Run the red infrastructure check before creating files:

```bash
test -f supabase/config.toml && test -f supabase/tests/000_smoke.test.sql
```

Expected red result: exit 1 because current main has migrations but no local Supabase config or database-test directory. Then run:

```bash
supabase init
```

Review generated `supabase/config.toml`; remove unrelated generated examples. Do **not** run `supabase link`, `db push`, remote reset, or any command containing a production project reference.

### Task 6.2: Add the minimal pgTAP smoke test

```sql
begin;
select plan(2);

select has_table('public', 'transactions', 'transactions table exists');
select has_function('public', 'enforce_transaction_reference_ownership', array[]::name[], 'ownership trigger function exists');

select * from finish();
rollback;
```

Run:

```bash
supabase start
supabase db reset --local
supabase test db
```

Expected green result: all committed migrations apply to the ephemeral local stack and both smoke assertions pass. If current migrations do not reset cleanly, stop and report the exact migration; do not edit historical migrations that may already be applied in production.

### Task 6.3: Add CI without remote credentials

Add a migration-test job using the official Supabase CLI setup and local Docker services. It must use no Supabase access token/project ref and run only `db reset --local` and `test db`.

Verification:

```bash
supabase db reset --local
supabase test db
npm test
npm run lint
npm run typecheck
npm run build
```

Commit:

```bash
git add supabase/config.toml supabase/tests/000_smoke.test.sql .github/workflows/ci.yml README.md

git commit -m "test: add local migration safety harness"
```

Rollback: revert harness files/workflow. Production boundary: none; any command resolving a linked remote project is a hard stop.

## 6A. S4A/S4B — Tenant-scoped monthly budget reset

**Risk:** Tier 2 — service-role database function plus production migration/runtime coordination.

**Objective:** Remove the current global no-argument owner scope. A reset must name one trusted user and must be unable to update any other owner's categories, budgets, or adjustment statistics.

**Repository migration files (S4A):**

- Create: `supabase/migrations/<timestamp>_tenant_scoped_monthly_budget_reset.sql`
- Create: `supabase/tests/tenant_scoped_monthly_budget_reset.test.sql`
- Reference only: `supabase/migrations/202605180001_monthly_auto_budget_reset.sql:91-159`

**Runtime files after separate apply (S4B):**

- Modify: `src/app/api/cron/monthly-budget-reset/route.ts:20-55`
- Modify: `src/app/api/cron/monthly-budget-reset/route.test.ts`

### Task 6A.1: Write failing owner-isolation tests

Using two synthetic auth users, prove:

1. the current `reset_monthly_auto_budgets(text)` signature exists at baseline and is therefore an unsafe red condition;
2. the replacement requires both `p_user_id` and `p_month_id`;
3. invoking for owner A creates/updates only owner A budgets and stats;
4. owner B rows and counts remain byte-for-byte unchanged;
5. a missing/null user and malformed month fail before writes;
6. any injected error rolls back owner A's budget/stat changes together.

Run before adding the migration:

```bash
supabase db reset --local
supabase test db supabase/tests/tenant_scoped_monthly_budget_reset.test.sql
```

Expected red result: the required `(uuid,text)` function and owner-isolation behavior do not exist, while the test confirms the unsafe `(text)` signature is still present.

### Task 6A.2: Add the scoped function and remove the global signature

Copy the existing function body into a **new migration** and make its complete security contract explicit:

```sql
create or replace function public.reset_monthly_auto_budgets(
  p_user_id uuid,
  p_month_id text default to_char((now() at time zone 'Asia/Taipei'), 'YYYY-MM')
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer := 0;
  tracked_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22004';
  end if;
  if p_month_id !~ '^\d{4}-\d{2}$' then
    raise exception 'month_id must use YYYY-MM format' using errcode = '22023';
  end if;

  perform set_config('app.suppress_budget_adjustment_tracking', 'on', true);

  with auto_categories as (
    select c.user_id, c.id as category_id, c.auto_amount
    from public.categories c
    where c.user_id = p_user_id
      and c.is_auto = true
      and c.auto_amount > 0
  ), upserted as (
    insert into public.budgets (user_id, month_id, category_id, allocated)
    select user_id, p_month_id, category_id, auto_amount from auto_categories
    on conflict (user_id, month_id, category_id) do update
      set allocated = excluded.allocated
      where public.budgets.allocated is distinct from excluded.allocated
    returning 1
  )
  select count(*) into changed_count from upserted;

  with auto_categories as (
    select c.user_id, c.id as category_id, c.auto_amount
    from public.categories c
    where c.user_id = p_user_id
      and c.is_auto = true
      and c.auto_amount > 0
  ), tracked as (
    insert into public.budget_auto_adjustment_stats (
      user_id, month_id, category_id, fixed_amount, latest_allocated, manual_adjustment_count
    )
    select user_id, p_month_id, category_id, auto_amount, auto_amount, 0 from auto_categories
    on conflict (user_id, month_id, category_id) do update
      set fixed_amount = excluded.fixed_amount,
          latest_allocated = excluded.latest_allocated,
          updated_at = timezone('utc', now())
    returning 1
  )
  select count(*) into tracked_count from tracked;

  return jsonb_build_object(
    'userId', p_user_id,
    'monthId', p_month_id,
    'changedBudgets', changed_count,
    'trackedAutoCategories', tracked_count
  );
end;
$$;

revoke all on function public.reset_monthly_auto_budgets(uuid,text) from public, anon, authenticated;
grant execute on function public.reset_monthly_auto_budgets(uuid,text) to service_role;
drop function public.reset_monthly_auto_budgets(text);
```

Do not keep a null/default `p_user_id` compatibility overload. The brief production interval before S4B must fail closed rather than run a global reset.

### Task 6A.3: Verify S4A and stop before production

```bash
supabase db reset --local
supabase test db supabase/tests/tenant_scoped_monthly_budget_reset.test.sql
supabase test db
npm test
npm run lint
npm run typecheck
npm run build
```

Commit migration/tests only. `S4A-PROD` is a separate exact-scope apply card with migration hash, target, read-only function-signature preflight, backup, explicit Matt grant, apply log, and schema/function readback. The apply intentionally causes the old runtime call to fail until S4B; release must schedule and monitor that fail-closed interval.

```bash
git add supabase/migrations/<timestamp>_tenant_scoped_monthly_budget_reset.sql supabase/tests/tenant_scoped_monthly_budget_reset.test.sql
git commit -m "fix: scope monthly budget reset by tenant"
```

### Task 6A.4: Write the failing route tests after verified apply

Tests must assert missing binding makes no RPC call, and the exact configured ID is passed as `p_user_id`.

```bash
npm test -- src/app/api/cron/monthly-budget-reset/route.test.ts
```

Expected red result: the missing-binding request still reaches the RPC path, and ordinary calls omit `p_user_id`.

### Task 6A.5: Switch the route

Require the trusted server binding and pass it to the RPC:

```ts
const userId = process.env.LITEYNAB_USER_ID?.trim();
if (!userId) {
  return NextResponse.json(
    { ok: false, error: "Missing LITEYNAB_USER_ID; monthly reset requires explicit tenant scope" },
    { status: 500 },
  );
}

const { data, error } = await supabase.rpc("reset_monthly_auto_budgets", {
  p_user_id: userId,
  p_month_id: targetMonth,
});
```

```bash
npm test -- src/app/api/cron/monthly-budget-reset/route.test.ts
npm test
npm run lint
npm run typecheck
npm run build
git add src/app/api/cron/monthly-budget-reset/route.ts src/app/api/cron/monthly-budget-reset/route.test.ts
git commit -m "fix: bind monthly reset to one tenant"
```

Expected green result: targeted and full suites pass, lint/typecheck/build exit 0, and the RPC payload always contains the configured tenant ID.

Distinct Tier 2 adversarial/formal review and release readback are required.

Rollback before S4A-PROD: revert migration PR. After apply: forward-fix the route/function; do not restore the global signature. Runtime rollback may leave the reset temporarily failed closed but must never broaden owner scope.

## 7. S5 — Remove runtime destructive legacy normalization

**Risk:** Tier 2 — removal of a production data-mutation path.

**Objective:** Stop page reads from performing multi-step category rewrites/deletes; historical normalization remains represented by committed SQL migrations, not an implicit browser side effect.

**Files:**

- Modify: `src/lib/data.ts:91-104,205-410,1086-1092`
- Modify: `src/lib/data.test.ts`

### Task 7.1: Write failing tests

Add a Supabase mock that records mutating calls during each public fetch function. Assert that dashboard/settings/budget fetches do not call category insert/update/delete merely because legacy names exist.

Run:

```bash
npm test -- src/lib/data.test.ts
```

Expected red result: legacy fixtures trigger mutation calls through `runLegacyCategoryNormalization`.

### Task 7.2: Delete only the runtime normalizer

Remove `LEGACY_CATEGORY_NAME_MAP`, `legacyCategoryNormalizationTasks`, `normalizeLegacyDuplicateCategories`, `ensureLegacyCategoryNormalization`, `runLegacyCategoryNormalization`, and the public-fetch invocation. Do not delete historical migration files or change category labels in this slice.

### Task 7.3: Verify and commit

```bash
npm test -- src/lib/data.test.ts
npm test
npm run lint
npm run typecheck
npm run build
```

Commit:

```bash
git add src/lib/data.ts src/lib/data.test.ts

git commit -m "fix: remove runtime category data migration"
```

Rollback: revert. Forward-fix: any remaining legacy production data requires a separately authorized, dry-run-first migration—not reintroducing page-load writes.

## 8. S6 — Category archive, history retention, and category-group ownership

**Risk:** Tier 2 — schema, RLS/reference, and historical data invariants.

**Objective:** Introduce reversible archive metadata, block hard deletion, replace every category-history cascade with RESTRICT, reject cross-owner category→group and adjustment-stat→category references, serialize group archive against active-child creation, and prevent archived categories from receiving new initialized/reset budgets.

**Files:**

- Create: `supabase/migrations/<timestamp>_category_archive_history_safety.sql`
- Create: `supabase/tests/category_archive_history_safety.test.sql`

Do not modify historical migration files.

### Task 8.1: Write failing dynamic DB tests

The test must create two auth users plus groups/categories/budgets/transactions, then assert:

1. cross-user `category_group_id` insert/update raises `23503`;
2. cross-user `budget_auto_adjustment_stats.category_id` insert/update raises `23503`, including service-role writes;
3. directly deleting a category raises the archive-required error and leaves transaction, budget, and adjustment-stat counts unchanged;
4. directly deleting a group raises the archive-required error and leaves descendants/history unchanged;
5. deleting a synthetic `auth.users` owner still allows the existing account-level cascades to remove that owner's complete dataset, so archive protection does not make account deletion impossible;
6. setting `archived_at` succeeds;
7. existing transaction, budget, and adjustment-stat references remain readable after archive;
8. an active category cannot be created/restored/moved under an archived group;
9. group archive fails while any active child exists and succeeds after all children are archived;
10. concurrent group archive versus active-child insert/restore serializes so both cannot commit an invalid state;
11. `initialize_monthly_budget` and tenant-scoped `reset_monthly_auto_budgets` ignore archived fixed-budget categories while retaining existing historical budget rows.

Use pgTAP `throws_ok`, `lives_ok`, and count assertions. Never use production identifiers or data.

Run:

```bash
supabase db reset --local
supabase test db supabase/tests/category_archive_history_safety.test.sql
```

Expected red result: missing `archived_at`, cross-owner category→group insert succeeds under service role, or hard delete cascades/removes rows.

### Task 8.2: Add a no-data-rewrite migration

The migration must contain these complete invariants. First read the four current FK names and delete actions from local `pg_constraint`; stop on any drift. The migration deliberately omits `IF EXISTS` on these drops so an unexpected name cannot leave a cascading FK active beside the new RESTRICT constraint:

```sql
alter table public.category_groups
  add column if not exists archived_at timestamptz;

alter table public.categories
  add column if not exists archived_at timestamptz;

alter table public.budgets
  drop constraint budgets_category_id_fkey,
  add constraint budgets_category_id_fkey
    foreign key (category_id) references public.categories(id) on delete restrict;

alter table public.transactions
  drop constraint transactions_category_id_fkey,
  add constraint transactions_category_id_fkey
    foreign key (category_id) references public.categories(id) on delete restrict;

alter table public.categories
  drop constraint categories_category_group_id_fkey,
  add constraint categories_category_group_id_fkey
    foreign key (category_group_id) references public.category_groups(id) on delete restrict;

alter table public.budget_auto_adjustment_stats
  drop constraint budget_auto_adjustment_stats_category_id_fkey,
  add constraint budget_auto_adjustment_stats_category_id_fkey
    foreign key (category_id) references public.categories(id) on delete restrict;

-- Reuse the current category-owner check for this second category reference.
drop trigger if exists budget_auto_adjustment_stats_enforce_reference_ownership
  on public.budget_auto_adjustment_stats;
create trigger budget_auto_adjustment_stats_enforce_reference_ownership
  before insert or update of user_id, category_id
  on public.budget_auto_adjustment_stats
  for each row
  execute function public.enforce_budget_reference_ownership();

create or replace function public.enforce_category_group_reference_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reference_owner uuid;
  reference_archived_at timestamptz;
begin
  select user_id, archived_at into reference_owner, reference_archived_at
  from public.category_groups
  where id = new.category_group_id
  for key share;

  if reference_owner is null or reference_owner <> new.user_id then
    raise exception '大項分類不屬於這個使用者 (category_group_id=%)', new.category_group_id
      using errcode = '23503';
  end if;
  if new.archived_at is null and reference_archived_at is not null then
    raise exception '已封存的大項分類不可新增或恢復啟用中的分類'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_category_group_reference_ownership() from public, anon, authenticated;

drop trigger if exists categories_enforce_group_ownership on public.categories;
create trigger categories_enforce_group_ownership
  before insert or update of user_id, category_group_id, archived_at
  on public.categories
  for each row
  execute function public.enforce_category_group_reference_ownership();

create or replace function public.enforce_category_group_archive_invariant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.categories
    where category_group_id = new.id
      and user_id = new.user_id
      and archived_at is null
  ) then
    raise exception '大項分類仍有啟用中的分類' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists category_groups_enforce_archive_invariant on public.category_groups;
create trigger category_groups_enforce_archive_invariant
  before update of archived_at on public.category_groups
  for each row
  execute function public.enforce_category_group_archive_invariant();

create or replace function public.archive_category_group(p_group_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  archived_group_id uuid;
begin
  if current_user_id is null then raise exception '尚未登入'; end if;

  perform 1
  from public.category_groups
  where id = p_group_id and user_id = current_user_id
  for update;
  if not found then raise exception '找不到大項分類' using errcode = 'P0002'; end if;

  if exists (
    select 1 from public.categories
    where category_group_id = p_group_id
      and user_id = current_user_id
      and archived_at is null
  ) then
    raise exception '大項分類仍有啟用中的分類' using errcode = '23514';
  end if;

  update public.category_groups
  set archived_at = timezone('utc', now())
  where id = p_group_id and user_id = current_user_id
  returning id into archived_group_id;
  return archived_group_id;
end;
$$;

revoke all on function public.archive_category_group(uuid) from public, anon, authenticated;
grant execute on function public.archive_category_group(uuid) to authenticated;

create or replace function public.reject_category_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from auth.users where id = old.user_id) then
    raise exception '分類不可直接刪除；請改用封存' using errcode = '55000';
  end if;
  return old; -- Account-owner deletion already removed auth.users; preserve its FK cascade.
end;
$$;

revoke all on function public.reject_category_hard_delete() from public, anon, authenticated;

create or replace function public.reject_category_group_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from auth.users where id = old.user_id) then
    raise exception '大項分類不可直接刪除；請改用封存' using errcode = '55000';
  end if;
  return old;
end;
$$;

revoke all on function public.reject_category_group_hard_delete() from public, anon, authenticated;

drop trigger if exists categories_reject_hard_delete on public.categories;
create trigger categories_reject_hard_delete
  before delete on public.categories
  for each row execute function public.reject_category_hard_delete();

drop trigger if exists category_groups_reject_hard_delete on public.category_groups;
create trigger category_groups_reject_hard_delete
  before delete on public.category_groups
  for each row execute function public.reject_category_group_hard_delete();
```

In the same migration, `create or replace` the full current definitions of:

- `initialize_monthly_budget(text)`, adding `and c.archived_at is null` to the category source query;
- `reset_monthly_auto_budgets(uuid,text)` from S4A, adding `and c.archived_at is null` to **both** `auto_categories` CTEs.

Do not edit the historical migration files and do not delete existing budget rows for archived categories. The new definitions affect future initialization/reset only. Preserve each function's existing grants and security mode, and add pgTAP assertions for function signatures/privileges.

Add indexes only if query plans justify them; at expected Lite YNAB scale, `archived_at` alone does not require speculative indexing.

Do not backfill, delete, merge, or rename any row. Existing rows naturally remain active because `archived_at is null`.

### Task 8.3: Verify repository migration

```bash
supabase db reset --local
supabase test db
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Commit:

```bash
git add supabase/migrations/<timestamp>_category_archive_history_safety.sql supabase/tests/category_archive_history_safety.test.sql

git commit -m "feat: enforce category archive history safety"
```

Rollback before production apply: revert migration PR. Rollback after production apply: do not drop archive columns or restore cascades. Forward-fix only; keep RESTRICT and hard-delete blockers while correcting functions/policies.

### Task 8.4: Tier 2 gates and production handoff

Required repository review evidence:

- isolated GPT-5.6-sol adversarial report at exact head;
- distinct formal review exact-head readback and typed verdict;
- QA runs local reset/tests and verifies migration from both empty and representative synthetic pre-migration state;
- release records migration filename/hash, target project, preflight SQL, backup, forward-fix, and whether merging the file itself deploys app code.

`S6-PROD` is a separate card. Its preflight is read-only and must prove zero cross-owner category→group rows, zero cross-owner adjustment-stat→category rows, and identify all four FK names/delete actions. Apply requires Matt's exact-scope grant. After apply, read back columns, constraints, triggers, and a synthetic non-production test account if available. Do not use real user rows for destructive testing.

## 9. S7 — Archive-aware application behavior

**Risk:** Tier 2 — writes production classification state and changes history-sensitive UI behavior; frontend UX QA required.

**Objective:** Replace destructive UI operations with archive updates while retaining archived labels in history and excluding them from new choices/new month initialization.

**Files:**

- Modify: `src/lib/types.ts:1-17`
- Modify: `src/lib/data.ts` query/mapping sites at `610-616,703-709,1043-1047,1088-1092`
- Modify: `src/lib/monthlyExpenseReportServer.ts:48-84`
- Modify: `src/lib/ynabImport.ts:312-315`
- Modify: `src/app/budget-allocation/BudgetAllocationPageClient.tsx:383-415,557-587`
- Modify: relevant quick-entry/category-picker/settings tests

Minimal semantics, chosen to avoid data loss rather than introduce product behavior:

- archive is reversible metadata;
- historic transactions and budgets retain the archived category/group and display name;
- archived categories are unavailable for new transactions, imports, and newly initialized future-month budgets;
- an existing budget row remains visible with an 「已封存」 badge so totals do not silently change;
- a group can be archived only through S6's database RPC after all child categories are archived; no cascade archive in v1;
- restore is out of scope unless PMO adds explicit acceptance criteria; the database value remains reversible.

### Task 9.1: Write failing selector/history tests

Add fixtures with active and archived categories. Assert:

- transaction/report history still resolves both names;
- category pickers/import mapping expose active only;
- budget rows with existing history remain visible and carry `archived: true`;
- category archive calls `.update({ archived_at: expect.any(String) })`, never `.delete()`;
- group archive calls `archive_category_group`, never performs a client-side count-then-update or `.delete()`.

Expected red: types lack `archived_at`, selectors include archived choices, and UI calls delete.

### Task 9.2: Add archive-aware types and projections

```ts
export type CategoryGroup = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  archived_at: string | null;
};

export type Category = {
  id: string;
  user_id: string;
  category_group_id: string;
  name: string;
  is_auto: boolean;
  auto_amount: number;
  is_quick: boolean;
  sort_order: number;
  archived_at: string | null;
};
```

Fetch all categories for history joins. Derive `activeCategories = categories.filter(category => category.archived_at === null)` only for new selections/import/new budget initialization.

### Task 9.3: Replace delete actions

```ts
const { error } = await supabase
  .from("categories")
  .update({ archived_at: new Date().toISOString(), is_quick: false })
  .eq("id", row.categoryId)
  .is("archived_at", null);
```

Read back the affected category row or use `.select("id,archived_at").maybeSingle()`; if no row returns, show a conflict/not-found error. For groups, call `supabase.rpc("archive_category_group", { p_group_id: groupId })` and map the database's active-child error to the existing Traditional Chinese UI. Do not perform a client-side count-then-update; S6's row locks and trigger are the concurrency authority.

### Task 9.4: Verify and commit

```bash
npm test -- src/lib/data.test.ts src/app/budget-allocation/page.test.tsx src/app/quick-entry/page.test.tsx src/app/transactions/page.test.tsx src/app/reports/page.test.tsx
npm test
npm run lint
npm run typecheck
npm run build
```

Commit:

```bash
git add src/lib/types.ts src/lib/data.ts src/lib/monthlyExpenseReportServer.ts src/lib/ynabImport.ts src/app/budget-allocation src/app/quick-entry src/app/transactions src/app/reports

git commit -m "feat: archive categories without deleting history"
```

Rollback: revert runtime commit; database protections remain. Forward-fix: keep hard-delete blocks and correct projection/filter behavior. Never restore hard delete to fix UX.

UX QA: archive a synthetic unused category, verify it disappears from new-entry pickers, remains labeled in historic views, existing budget row shows 「已封存」, and group archive is blocked while an active child remains.

## 10. S8 — Database-backed source idempotency

**Risk:** Tier 2 — unique constraint on production transaction data.

**Objective:** Make source identity a database invariant and fail safely on existing duplicates.

**Files:**

- Create: `supabase/migrations/<timestamp>_transaction_source_idempotency.sql`
- Create: `supabase/tests/transaction_source_idempotency.test.sql`

### Task 10.1: Write failing dynamic tests

Test that:

- two rows for the same `(user_id, source, source_id)` are rejected;
- the same `source_id` for different users is allowed;
- the same `source_id` under different sources is allowed;
- multiple rows with `source_id is null` are allowed.

Expected red: duplicate same-owner/source inserts succeed because the current index is non-unique.

### Task 10.2: Add preflight and unique constraint

```sql
do $$
begin
  if exists (
    select 1
    from public.transactions
    where source_id is not null
    group by user_id, source, source_id
    having count(*) > 1
  ) then
    raise exception 'duplicate transaction source identities exist; aborting constraint creation';
  end if;
end
$$;

drop index if exists public.idx_transactions_user_source_source_id;

alter table public.transactions
  add constraint transactions_user_source_source_id_key
  unique (user_id, source, source_id);
```

PostgreSQL unique constraints permit multiple null `source_id` values, so no partial index is necessary. Do not deduplicate rows in this migration. Any preflight duplicate becomes a separate, exact-row remediation decision with backup and audit.

### Task 10.3: Verify repository migration

```bash
supabase db reset --local
supabase test db supabase/tests/transaction_source_idempotency.test.sql
supabase test db
npm test
npm run lint
npm run typecheck
npm run build
```

Commit:

```bash
git add supabase/migrations/<timestamp>_transaction_source_idempotency.sql supabase/tests/transaction_source_idempotency.test.sql

git commit -m "feat: enforce transaction source idempotency"
```

Rollback before apply: revert. After apply: forward-fix; do not drop uniqueness merely because a caller mishandles `23505`.

`S8-PROD` is separate and requires a read-only duplicate preflight with zero rows plus Matt exact-scope apply authorization.

## 11. S9 — Concurrency-safe Hermes and YNAB retry handling

**Risk:** Tier 2 — transaction ingestion and service-role data path.

**Objective:** Treat the S8 database constraint as the authority; ordinary and concurrent retries return the existing transaction rather than 500 or duplicate rows.

**Files:**

- Modify: `src/app/api/hermes/transactions/route.ts:109-123,304-342`
- Modify: `src/app/api/hermes/transactions/route.test.ts`
- Modify: `src/lib/ynabImport.ts:470-576`
- Modify: `src/lib/ynabImport.test.ts:127-281`

### Task 11.1: Write failing uniqueness-race tests

Hermes test: precheck returns null, insert returns PostgREST/Postgres code `23505`, scoped readback returns `existing-tx`; expected response is 200 `{ ok: true, duplicate: true, transactionId: "existing-tx" }`.

YNAB test: one row conflicts during the insert even though initial scan did not see it; expected result increments `skippedDuplicateCount`, does not fail the batch, and does not count the row as imported.

Expected red: Hermes returns 500; YNAB throws.

### Task 11.2: Handle the database race, not all errors

```ts
function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}
```

On Hermes insert `23505`, perform a tenant-scoped readback by `(user_id, source, source_id)` and return duplicate success. Any other error remains a failure. If readback finds nothing, return a 409/500 consistency error; do not fabricate an ID.

For YNAB, use `upsert(..., { onConflict: "user_id,source,source_id", ignoreDuplicates: true })` only after local integration proves PostgREST targets the committed unique constraint. Select inserted IDs so result counts reflect actual inserted rows. Keep the in-memory signature check as user-friendly best effort, but do not claim it is the invariant.

### Task 11.3: Verify and commit

```bash
npm test -- src/app/api/hermes/transactions/route.test.ts src/lib/ynabImport.test.ts
npm test
npm run lint
npm run typecheck
npm run build
```

Commit:

```bash
git add src/app/api/hermes/transactions/route.ts src/app/api/hermes/transactions/route.test.ts src/lib/ynabImport.ts src/lib/ynabImport.test.ts

git commit -m "fix: make transaction ingestion retry-safe"
```

Rollback: revert runtime code while keeping uniqueness; callers may see conflicts but cannot duplicate data. Forward-fix preferred.

## 12. S10/S11 — Atomic current-app writes

**Risk:** Tier 2 — new database functions and money-allocation write paths.

**Objective:** Replace current multi-call category+budget creation, budget batch updates, and category-group reorder saves with owner-checked transactional RPCs. This closes the identified current-app multi-write paths and establishes the atomic pattern that future travel event+summary creation must follow, without creating travel entities now.

**Repository migration files (S10):**

- Create: `supabase/migrations/<timestamp>_atomic_budget_write_rpcs.sql`
- Create: `supabase/tests/atomic_budget_write_rpcs.test.sql`

**Runtime files after separate apply (S11):**

- Modify: `src/app/budget-allocation/BudgetAllocationPageClient.tsx:417-456,520-546,698-787`
- Modify: `src/app/budget-allocation/page.test.tsx`
- Modify: `src/app/budget-allocation/wizard/page.tsx:140-166`
- Test: `src/app/budget-allocation/wizard/page.test.tsx`

### Task 12.1: Write failing atomicity tests

Use pgTAP to prove:

- a valid category+budget call creates both;
- an invalid month/budget causes neither row to remain;
- a group from another owner is rejected;
- one invalid budget ID in a batch leaves every allocation unchanged;
- duplicate budget IDs or IDs outside the requested month are rejected;
- one invalid/duplicate/cross-owner group ID in a reorder leaves every `sort_order` unchanged;
- reorder payload must contain the complete active group set exactly once so omitted rows cannot retain colliding order values;
- only `auth.uid()` rows can be changed.

Expected red: functions do not exist.

### Task 12.2: Add the RPCs

The complete contract for category creation is:

```sql
create or replace function public.create_category_with_month_budget(
  p_category_group_id uuid,
  p_name text,
  p_sort_order integer,
  p_month_id text
)
returns table(category_id uuid, budget_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_category_id uuid;
  new_budget_id uuid;
begin
  if current_user_id is null then raise exception '尚未登入'; end if;
  if p_month_id !~ '^\d{4}-\d{2}$' then raise exception 'month_id 格式錯誤'; end if;
  if not exists (
    select 1 from public.category_groups
    where id = p_category_group_id
      and user_id = current_user_id
      and archived_at is null
  ) then
    raise exception '找不到可用的大項分類' using errcode = '23503';
  end if;

  insert into public.categories (
    user_id, category_group_id, name, is_auto, auto_amount, is_quick, sort_order
  ) values (
    current_user_id, p_category_group_id, trim(p_name), false, 0, false, p_sort_order
  ) returning id into new_category_id;

  insert into public.budgets (user_id, month_id, category_id, allocated)
  values (current_user_id, p_month_id, new_category_id, 0)
  returning id into new_budget_id;

  return query select new_category_id, new_budget_id;
end;
$$;

revoke all on function public.create_category_with_month_budget(uuid,text,integer,text) from public, anon;
grant execute on function public.create_category_with_month_budget(uuid,text,integer,text) to authenticated;
```

Apply the same default-deny/function-signature rule to the budget-batch and group-order RPCs; pgTAP must assert anonymous execution is denied and authenticated execution is granted.

The budget batch function accepts JSON records `{ "budgetId": "uuid", "allocated": 123 }`, validates the full set first, then updates in one SQL statement. It must reject missing, duplicate, cross-owner, cross-month, negative, or non-integer amounts before any update. Return updated IDs/count for readback.

Add `apply_category_group_order(p_groups jsonb)`. Each record is `{ "groupId": "uuid", "sortOrder": 0 }`. Before updating, reject null/duplicate IDs, negative/duplicate sort orders, cross-owner IDs, archived groups, and any payload whose IDs do not exactly equal the current user's active group IDs. Lock the full active group set `for update`, validate it, update in one statement, and return IDs/count. This contract covers both `BudgetAllocationPageClient.tsx` and `wizard/page.tsx`; do not leave either `Promise.all` path behind.

Do not include YNAB import or travel entities in this migration; keep one failure domain per migration.

### Task 12.3: Verify S10 and stop before production

```bash
supabase db reset --local
supabase test db supabase/tests/atomic_budget_write_rpcs.test.sql
supabase test db
npm test
npm run lint
npm run typecheck
npm run build
```

Expected green result: targeted and full database tests pass, all application regressions pass, and lint/typecheck/build exit 0.

Commit migration/tests only. `S10-PROD` is a separate exact-scope apply card.

```bash
git add supabase/migrations/<timestamp>_atomic_budget_write_rpcs.sql supabase/tests/atomic_budget_write_rpcs.test.sql
git commit -m "feat: add atomic budget write RPCs"
```

### Task 12.4: Switch callers after verified apply

In S11, replace category insert+budget insert with one RPC, replace `Promise.all` budget updates with one budget-batch RPC, and replace both category-group reorder `Promise.all` paths with `apply_category_group_order`. Require returned IDs/count and show an error if readback differs from requested count.

Targeted test command:

```bash
npm test -- src/app/budget-allocation/page.test.tsx src/app/budget-allocation/wizard/page.test.tsx
```

Extend the existing `src/app/budget-allocation/wizard/page.test.tsx`. Expected red before runtime change: tests observe direct multi-call writes rather than one RPC. Expected green after: one RPC call per user action and no optimistic success before readback.

Full regression:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Commit:

```bash
git add src/app/budget-allocation

git commit -m "fix: make budget batch writes atomic"
```

Rollback runtime: revert callers; database RPC may remain unused. Never roll back by weakening ownership or transaction checks.

UX QA: create a category, reorder groups from both entry points, copy previous budgets, and apply fixed budgets using synthetic data. Confirm one success state, accurate counts, disabled pending state, and no partially updated rows/order values after an injected failure.

## 13. S12 — Atomic, retry-safe YNAB import

**Risk:** Tier 2 — cross-table migration/RPC and ingestion path.

**Objective:** Replace the current multi-stage client import with one owner-scoped PostgreSQL transaction after S8/S9 uniqueness and S10 atomic patterns are proven.

This slice deliberately comes last. It is not required to decide Option B semantics and must not be bundled with travel work.

**Files:**

- Create: `supabase/migrations/<timestamp>_atomic_ynab_import.sql`
- Create: `supabase/tests/atomic_ynab_import.test.sql`
- After separate production apply, modify: `src/lib/ynabImport.ts:308-577`
- Test: `src/lib/ynabImport.test.ts:127-281`

The RPC input contains the already-normalized preview values, not raw YNAB secrets/tokens. It must:

1. derive owner from `auth.uid()`;
2. upsert owner-scoped groups/categories/payment methods;
3. initialize months;
4. map IDs inside the transaction;
5. insert transactions with `(user_id,source,source_id)` conflict-ignore;
6. return actual created/skipped counts;
7. roll back dimensions/months/transactions together on any non-uniqueness error.
8. revoke execution from `public`/`anon`, grant only `authenticated`, and prove those privileges dynamically.

### Task 13.1: Write the failing database tests

Define one function signature, `public.import_ynab_preview(p_preview jsonb)`, and build a two-owner fixture. The pgTAP file must prove:

- owner A cannot create or resolve any owner B group/category/payment method;
- empty names, non-positive/non-integer amounts, invalid dates, mismatched `monthId`, duplicate source IDs inside the payload, or a transaction whose dimension names are absent from the normalized payload fail before writes;
- created dimension sort orders are deterministic and active archived-parent rules from S6 remain enforced;
- an existing `(date, amount, category, payment method, normalized note)` signature is skipped, preserving current import behavior;
- replaying the same payload creates zero dimensions/transactions and reports every transaction as skipped;
- the same `sourceId` remains independent for owner B;
- a test-only trigger that raises on transaction insert causes the function to throw after attempted dimension work, and pgTAP then proves zero net row changes from the call;
- anonymous execution is denied and authenticated execution is granted.

Run:

```bash
supabase db reset --local
supabase test db supabase/tests/atomic_ynab_import.test.sql
```

Expected red result: `public.import_ynab_preview(jsonb) does not exist` and no assertion is weakened to accommodate the missing function.

### Task 13.2: Add the minimal owner-scoped transaction

Use exactly the normalized `YnabImportPreview` keys already defined at `src/lib/ynabImport.ts:82-92`; do not send raw YNAB responses or credentials. The migration begins with this security envelope:

```sql
create or replace function public.import_ynab_preview(p_preview jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception '尚未登入';
  end if;

  -- Validate the complete normalized payload before the first write.
  -- Upsert owner-scoped dimensions, initialize distinct months, resolve IDs,
  -- and insert source-unique/non-signature-duplicate transactions here.
  -- PL/pgSQL function execution is one transaction: any exception rolls all
  -- dimension, month, budget, and transaction changes back together.

  return jsonb_build_object(
    'createdGroupCount', 0,
    'createdCategoryCount', 0,
    'createdPaymentMethodCount', 0,
    'importedTransactionCount', 0,
    'skippedDuplicateCount', 0
  );
end;
$$;

revoke all on function public.import_ynab_preview(jsonb) from public, anon;
grant execute on function public.import_ynab_preview(jsonb) to authenticated;
```

The comment block is a placement guide, not a stub acceptance state. Replace it in the implementation with set-based SQL that fulfills all Task 13.1 assertions. Use `auth.uid()` in every dimension query/write; use existing unique keys for dimension upserts; derive and validate month IDs from transaction dates; call `initialize_monthly_budget` for each distinct month inside the same function; retain current `source_text` and `metadata.ynab` fields; anti-join existing owner-scoped transaction signatures; and use S8's `(user_id, source, source_id)` constraint as the final concurrency authority. Counts must come from `RETURNING` rows, not requested-array lengths.

Verify the repository migration:

```bash
supabase db reset --local
supabase test db supabase/tests/atomic_ynab_import.test.sql
supabase test db
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected green result: targeted and full database tests pass, all application regressions pass, and every command exits 0.

Commit the migration/test only:

```bash
git add supabase/migrations/<timestamp>_atomic_ynab_import.sql supabase/tests/atomic_ynab_import.test.sql
git commit -m "feat: make YNAB import atomic"
```

Stop here. Production apply is a separate Tier 2 card requiring migration hash, target, read-only preflight, backup/forward-fix, exact Matt grant, apply output, function/privilege readback, and synthetic smoke evidence. Repository merge is not apply authorization.

### Task 13.3: Write the failing runtime adapter test after verified apply

Change the existing Supabase mock so the expected operation is exactly one RPC with the normalized preview. Assert there are no direct dimension/month/transaction writes and that returned RPC counts become the existing `YnabImportResult`.

```bash
npm test -- src/lib/ynabImport.test.ts
```

Expected red result before the adapter change: the test observes direct `.from(...).insert(...)` calls, repeated `initialize_monthly_budget` RPCs, and no `import_ynab_preview` RPC.

### Task 13.4: Switch the runtime adapter, verify, and commit

Replace only `importYnabPreviewToLiteYnab`; keep `buildYnabImportPreview` unchanged. The minimal adapter is:

```ts
export async function importYnabPreviewToLiteYnab(
  supabase: SupabaseClient,
  preview: YnabImportPreview,
): Promise<YnabImportResult> {
  const { data, error } = await supabase.rpc("import_ynab_preview", { p_preview: preview });
  if (error) throw error;
  return data as YnabImportResult;
}
```

Run:

```bash
npm test -- src/lib/ynabImport.test.ts
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: targeted and full suites pass; lint, typecheck, and build exit 0.

Commit:

```bash
git add src/lib/ynabImport.ts src/lib/ynabImport.test.ts
git commit -m "fix: route YNAB import through atomic RPC"
```

Rollback before production apply: revert the migration PR. After apply: forward-fix the function; do not remove uniqueness/ownership controls. Runtime rollback must not re-enable the non-atomic importer—disable import or forward-fix the adapter. Hard stop on partial-count mismatches, privilege drift, unproven rollback, failed current-head CI, or any request to include raw YNAB credentials.

Repository migration, production apply, and runtime switch are three distinct cards. The apply card needs Matt exact-scope authorization; the runtime card begins only after schema and privilege readback.

## 14. Current-head review, QA, and no-drop handoff

Every implementation PR must carry this exact evidence shape:

```text
交接包：
- 風險分級：Tier 0 / Tier 1 / Tier 2
- 狀態：完成 / 部分完成 / 阻塞
- 本棒完成：slice ID + acceptance criteria
- 證據：branch, commit, PR, exact head, changed-path union, targeted tests, full tests, lint, typecheck, build, CI URL
- Tier 2 review evidence：isolated GPT-5.6-sol adversarial report path/status + distinct formal GPT-5.6-sol exact-head readback and typed verdict
- Semantic next route：PASS dependency or fix→re-gate; never infer gate pass from task=done
- Downstream hold proof：production apply remains blocked until explicit parent/gate and scoped grant
- 未完成：production apply / runtime rollout / UX QA / later slices
- 風險：data, auth, deploy, migration, rollback/forward-fix
- 下一棒：specific role
- 下一棒任務：one sentence with artifact and verification
- 需要 Matt 決策：only canonical hard stop, with exact scope
- 禁止自動做：force-push, secrets/env/OAuth, production DB/data, destructive action, deploy/restart, unclear-risk action
- production_mutation=false for every repository implementation/review/QA card
```

Gate rules:

- Review reads `gh pr diff`, exact head, and current-head checks; it does not trust author file lists.
- Tier 1 uses one independent combined review+QA gate. Tier 2 uses the full pipeline and two isolated Sol review contexts per D-021.
- QA reruns the exact commands from the slice. Migration QA uses a local ephemeral stack and synthetic fixtures only.
- Frontend S3, S7, and S11 cannot release without UX QA.
- Release verifies whether a main merge auto-deploys. Unknown deploy behavior is a hard stop, not an assumption.
- Repository migration merge may be allowed after gates, but its handoff must say `production mutation: false` and keep the apply card blocked.
- Production apply evidence must include target project, migration hash, read-only preflight, backup, exact grant, apply output, schema readback, and forward-fix.

## 15. Plan-level acceptance checklist

- [ ] All six prerequisites are explicitly assessed as satisfied/partial/gap from current-main evidence.
- [ ] Every slice has Tier, dependencies, exact paths/ranges, TDD red/green cycle, targeted/full commands, commit point, rollback/forward-fix, production boundary, and hard stop.
- [ ] Production migration apply is never combined with repository implementation.
- [ ] Category history cannot be cascade-deleted and archive behavior preserves historic labels.
- [ ] Existing ownership/RLS controls are credited; remaining category→group, adjustment-stat→category, trusted Hermes binding, monthly-report, and global monthly-reset gaps are closed in explicit slices.
- [ ] Group archive versus child creation is a database-serialized invariant, and archived fixed categories are excluded from both initializer and reset functions before archive UI rollout.
- [ ] Atomicity scope covers category+budget creation, budget batches, both group-reorder paths, and YNAB import, and establishes the future event+summary rule without designing travel entities.
- [ ] CSV, HTML-XLS, and Google Sheets paths share one sanitization rule.
- [ ] Idempotency is database-backed and tenant-scoped, not check-then-insert only.
- [ ] Reproducibility addresses lock drift, the CI workaround, Docker `npm install`, and interactive lint.
- [ ] No account ledger, Ready to Assign, reconciliation, FX, payment splitting, automatic travel classification, or transaction splits appear as work.
- [ ] No-drop handoff, current-head gates, frontend UX QA, and isolated Tier 2 GPT-5.6-sol evidence are explicit.
- [ ] `t_34ba1232` is treated as resolved Option A/maturity 5, while the plan remains independent of its product semantics.

## 16. PMO next action

The Tier 0 SPEC decision addendum is merged at current main. PMO should now create only S1 plus its required Tier 2 gates. Do not create S2-S12 yet. S1 is the smallest plan-grounded Tier 2 repository implementation slice; it has no schema, production data, secrets/env, or migration apply. Its completion does not authorize any production DB/schema/data action.

## 17. Release matrix

| Future action | Repository-only? | Merge may auto-deploy? | Separate Matt exact-scope grant? | Required gate / rollback |
|---|---:|---:|---:|---|
| S1 tenant-scope runtime code | Yes | Yes/assume possible | No for repo work; env change would require separate grant | Tier 2 adversarial/formal review + QA + release; revert code, never relax tenant scope. |
| S2 package/CI/Docker | Yes | Yes, likely if main is connected | No for repo work; manual deploy/restart requires grant | Tier 2 infra review/QA/release; revert exact commit/image. |
| S3 export sanitization | Yes | Yes/assume possible | No | Tier 1 combined review+QA + UX QA; revert helper/callers together. |
| S4 local migration harness | Yes; local ephemeral DB only | Workflow merge does not itself mutate DB, but app auto-deploy remains possible | No remote grant; remote DB commands forbidden | Tier 2 infra review/QA; revert harness. |
| S4A tenant-scoped reset migration | Yes; migration file/test only | App auto-deploy may occur, but migration file merge must not apply DB | **No apply implied. Yes for S4A-PROD.** | Tier 2 DB review + local isolation tests; revert before apply, forward-fix after apply. |
| S4A-PROD production apply | No | Not an allowed merge side effect | **Always yes** | Exact migration/target/preflight/backup/grant/apply/readback; old route fails closed until S4B. |
| S4B tenant-bound reset route | Yes | Yes/assume possible | No for repo work; env change separately gated | Tier 2 auth/data-path review+QA+release; revert may fail closed but must not restore global reset. |
| S5 remove runtime normalizer | Yes | Yes/assume possible | No | Tier 2 data-path review/QA/release; revert code. |
| S6/S8/S10/S12 migration files and tests | Yes | App auto-deploy may occur, but migration file merge must not apply DB | **No apply implied. Yes for any production apply.** | Tier 2 adversarial/formal review + local DB QA + release; revert before apply, forward-fix after apply. |
| `supabase db push`, migration apply, RLS/FK/constraint/function changes in production | No | Not a merge side effect allowed by this plan | **Always yes** | Exact target/scope/hash, preflight, backup, grant, apply log, readback, forward-fix. |
| Duplicate remediation, category backfill, row update/delete in production | No | No | **Always yes** | Exact row set/count, dry run, backup, audit, scoped grant; destructive deletion is not an accepted fix. |
| S7/S9/S11 runtime switches after schema apply | Yes | Yes/assume possible | No for repo work; schema must already be verified | Tier 2 review/QA/release; UX QA for S7/S11; revert runtime while retaining safe DB invariants. |
| S12 YNAB runtime adapter after schema apply | Yes | Yes/assume possible | No for repo work; schema/privileges must already be verified | Tier 2 review/QA/release; disable import or forward-fix rather than restoring non-atomic writes. |
| Secrets/env/OAuth changes, deploy/restart, manual rollback | No | N/A | **Always yes** | Exact variable/service/target without secret values, rollback, readback. |
| Travel/Option B implementation | No, not part of this plan | Unknown | New PMO implementation authorization; production actions separately granted | Blocked until relevant safety controls are verified and PMO releases a feature slice. |