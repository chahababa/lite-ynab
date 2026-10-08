import { NextResponse } from "next/server";
import { ctbcApply, ctbcApplyBatch, ctbcEnabled, ctbcLoad } from "@/lib/ctbcInboxServer";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "failed";
  return NextResponse.json({ error: ["disabled","unauthorized","invalid_command","action_conflict","load_failed"].includes(code) ? code : "failed" },
    { status: code === "disabled" ? 404 : code === "unauthorized" ? 401 : code === "invalid_command" ? 400 : code === "action_conflict" ? 409 : 503, headers });
}
export async function GET(request: Request) {
  if (!ctbcEnabled()) return failure(new Error("disabled"));
  try { return NextResponse.json(await ctbcLoad(request),{headers}); } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!ctbcEnabled()) return failure(new Error("disabled"));
  try {
    const body=await request.json();
    const result=body&&typeof body==="object"&&Object.keys(body).length===1&&Array.isArray(body.commands)
      ?await ctbcApplyBatch(request,body.commands):await ctbcApply(request,body);
    return NextResponse.json(result,{headers});
  } catch(error) { return failure(error); }
}
