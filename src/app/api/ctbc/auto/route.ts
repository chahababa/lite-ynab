import { NextResponse } from "next/server";

import { ctbcAutoImport, ctbcEnabled } from "@/lib/ctbcInboxServer";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

// 依自動歸類規則補記乾淨的待確認刷卡。沒有請求內容：要記哪些、記到哪裡，全部由伺服器依規則決定。
export async function POST(request: Request) {
  if (!ctbcEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404, headers });
  try {
    return NextResponse.json(await ctbcAutoImport(request), { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "failed";
    return NextResponse.json(
      { error: code === "unauthorized" ? "unauthorized" : code === "load_failed" ? "load_failed" : "failed" },
      { status: code === "unauthorized" ? 401 : 503, headers },
    );
  }
}
