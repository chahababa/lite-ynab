import { afterEach, describe, expect, it, vi } from "vitest";
import { ctbcEnabled, ctbcUserClient, ctbcValidateCommand } from "./ctbcInboxServer";
import { GET, POST } from "@/app/api/ctbc/inbox/route";

const id="00000000-0000-4000-8000-000000000001";
const command={candidateId:id,expectedVersion:1,action:"work",actionKey:id};
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
