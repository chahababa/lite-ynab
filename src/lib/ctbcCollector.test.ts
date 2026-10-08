import { describe, expect, it } from "vitest";
import fixture from "@/test-fixtures/ctbc-email-alert.synthetic.json";
import { ctbcSlot, prepareCtbcSyntheticBatch, type CtbcSyntheticEnvelope } from "./ctbcCollector";

const date="2026-07-23";
const envelope=(overrides:Partial<CtbcSyntheticEnvelope>={}):CtbcSyntheticEnvelope=>({synthetic:true,internalDate:Date.parse(fixture.receivedAt),trustedHeader:true,input:fixture,...overrides});
describe("CTBC server parsing boundary",()=>{
 it("fixes Taiwan slot, half-open receive window, and three cohorts",()=>{
  const s=ctbcSlot(date);
  expect(new Date(s.start).toISOString()).toBe("2026-07-18T16:00:00.000Z");
  expect(new Date(s.end).toISOString()).toBe("2026-07-23T09:00:00.000Z");
  expect(new Date(s.stop).toISOString()).toBe("2026-07-23T16:00:00.000Z");
  expect(s.cohorts).toEqual(["2026-07-20","2026-07-21","2026-07-22"]);
  expect(prepareCtbcSyntheticBatch(date,[envelope({internalDate:s.start}),envelope({internalDate:s.end})],"1234",true).rows).toHaveLength(1);
  expect(()=>ctbcSlot("2026-02-30")).toThrow();
 });
 it("filters the target card before persistence and returns irreversible identities",()=>{
  const result=prepareCtbcSyntheticBatch(date,[envelope()],"1234",true);
  expect(result.rows).toHaveLength(1);
  const row=result.rows[0];
  expect(row).toMatchObject({amount:1280,merchant:"範例餐廳",card_role:"primary"});
  expect(row.source_id).toMatch(/^ctbc:v1:[a-f0-9]{64}:[a-f0-9]{64}$/);
  expect(row.payload_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(row).not.toHaveProperty("cardLast4");
  expect(row).not.toHaveProperty("messageId");
  expect(JSON.stringify(result)).not.toContain(fixture.messageId);
  expect(result).toEqual(prepareCtbcSyntheticBatch(date,[envelope()],"1234",true));
 });
 it("blocks identical target rows instead of silently merging two purchases",()=>{
  const row="<tr><td>旅遊聯名卡 (正卡)</td><td>1234</td><td>2026/07/22 09:15</td><td>$1,280 元</td><td>範例餐廳</td><td>餐飲美食 行動支付</td></tr>";
  const input={...fixture,html:fixture.html.replace(row,row+row)};
  // The fixture uses nested markup; duplicate the original complete first row.
  const first=fixture.html.match(/<tr><td><font>[\s\S]*?<\/tr>/)?.[0];
  expect(first).toBeTruthy();input.html=fixture.html.replace(first!,first!+first!);
  const result=prepareCtbcSyntheticBatch(date,[envelope({input})],"1234",true);
  expect(result.rows).toEqual([]);expect(result.counts.failures).toBe(1);
 });
 it("rejects untrusted provenance and preserves partial failure warnings",()=>{
  const result=prepareCtbcSyntheticBatch(date,[envelope(),envelope({trustedHeader:false})],"1234",false);
  expect(result.counts).toMatchObject({failures:1,rejected:1,messages:1});
  expect(result.rows[0].warnings).toEqual(["partial_batch"]);
  expect(prepareCtbcSyntheticBatch(date,[envelope({input:{...fixture,from:"attacker@example.invalid"}})],"1234",true).rows).toEqual([]);
 });
 it("removes account-like digits from displayed free text",()=>{
  const input={...fixture,html:fixture.html.replaceAll("範例餐廳","範例 1234 987654321 餐廳")};
  expect(prepareCtbcSyntheticBatch(date,[envelope({input})],"1234",true).rows[0].merchant).toBe("範例 餐廳");
 });
});
