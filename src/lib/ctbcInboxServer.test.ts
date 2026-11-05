import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctbcApply, ctbcApplyBatch } from "./ctbcInboxServer";

const provider = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: provider.createClient }));
beforeEach(() => {
 vi.clearAllMocks();
 provider.getUser.mockResolvedValue({ data: { user: { id: "synthetic-owner" } }, error: null });
 provider.rpc.mockResolvedValue({ data: { code: "ready" }, error: null });
 provider.createClient.mockReturnValue({ auth: { getUser: provider.getUser }, rpc: provider.rpc });
});
import { ctbcEnabled, ctbcUserClient, ctbcValidateCommand } from "./ctbcInboxServer";
import { GET, POST } from "@/app/api/ctbc/inbox/route";

const id="00000000-0000-4000-8000-000000000001";
const command={candidateId:id,expectedVersion:1,action:"work",actionKey:id};
const invalidActions: unknown[] = [["work"], ["import"], ["link"], ["ignore"], ["defer"], [["import"]], [], {}, { action: "work" }, null, 1, true, false, " WORK ", "approve"];
const validBatchCommand = { ...command, action: "import", batch: true, categoryId: id, paymentId: id };
const request = () => new Request("http://localhost/api/ctbc/inbox", { headers: { authorization: "Bearer synthetic-session" } });
function expectNoProvider() {
 expect(provider.createClient).not.toHaveBeenCalled();
 expect(provider.getUser).not.toHaveBeenCalled();
 expect(provider.rpc).not.toHaveBeenCalled();
}
describe("CTBC strict action regressions (synthetic provider only)", () => {
 it("rejects missing, boxed, and coercible actions without invoking string conversion or auth", async () => {
  const toString = vi.fn(() => "work");
  const actions = [undefined, new String("work"), { toString }];
  vi.stubEnv("CTBC_INBOX_ENABLED", undefined);
  for (const action of actions) {
   expect(() => ctbcValidateCommand({ ...command, action })).toThrow("invalid_command");
   await expect(ctbcApply(request(), { ...command, action })).rejects.toThrow("invalid_command");
  }
  expect(toString).not.toHaveBeenCalled();
  expectNoProvider();
 });
 it.each(["import", "link", "ignore", "defer", "work"])("retains primitive %s command shape without normalization", (action) => {
  const value = { ...command, action, categoryId: null, paymentId: id, resolveRisk: false, batch: false };
  expect(ctbcValidateCommand(value)).toBe(value);
  expect(ctbcValidateCommand(value)).toEqual(value);
 });
 it.each(invalidActions.map((action) => ({ action })))("rejects malformed action $action before the default-off auth boundary", async ({ action }) => {
  vi.stubEnv("CTBC_INBOX_ENABLED", undefined);
  expect(() => ctbcValidateCommand({ ...command, action })).toThrow("invalid_command");
  await expect(ctbcApply(request(), { ...command, action })).rejects.toThrow("invalid_command");
  expectNoProvider();
 });
 it.each(invalidActions.map((action) => ({ action })))("rejects POST action $action before client/auth/RPC", async ({ action }) => {
  vi.stubEnv("CTBC_INBOX_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-not-a-key");
  const response = await POST(new Request(request(), { method: "POST", body: JSON.stringify({ ...command, action }) }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_command" });
  expectNoProvider();
 });
 it.each(invalidActions.map((action) => ({ action })))("rejects whole batch containing action $action before preflight/auth/RPC", async ({ action }) => {
  vi.stubEnv("CTBC_INBOX_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-not-a-key");
  const commands = [validBatchCommand, { ...validBatchCommand, candidateId: "00000000-0000-4000-8000-000000000002", actionKey: "00000000-0000-4000-8000-000000000002", action }];
  await expect(ctbcApplyBatch(request(), commands)).rejects.toThrow("invalid_command");
  const response = await POST(new Request(request(), { method: "POST", body: JSON.stringify({ commands }) }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_command" });
  expectNoProvider();
 });
});
afterEach(()=>vi.unstubAllEnvs());
describe("CTBC API authorization boundary",()=>{
 it("is disabled by default without contacting any provider",async()=>{
  vi.stubEnv("CTBC_INBOX_ENABLED",undefined);
  expect(ctbcEnabled()).toBe(false);
  await expect(ctbcUserClient(new Request("http://localhost"))).rejects.toThrow("disabled");
  expect((await GET(new Request("http://localhost"))).status).toBe(404);
  expect((await POST(new Request("http://localhost",{method:"POST",body:"invalid"}))).status).toBe(404);
 });
 it("requires an authenticated bearer token when explicitly enabled",async()=>{
  vi.stubEnv("CTBC_INBOX_ENABLED","true");
  await expect(ctbcUserClient(new Request("http://localhost"))).rejects.toThrow("unauthorized");
 });
 it("rejects payload owner injection, malformed versions, and arbitrary fields",()=>{
  expect(ctbcValidateCommand(command)).toEqual(command);
  for(const extra of [{userId:id},{expectedVersion:0},{expectedVersion:"1"},{candidateId:"invalid"},{action:"approve"},{resolveRisk:1}])expect(()=>ctbcValidateCommand({...command,...extra})).toThrow("invalid_command");
 });
});
