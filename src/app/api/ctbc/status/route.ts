import { NextResponse } from "next/server";
import { ctbcEnabled } from "@/lib/ctbcInboxServer";
export const dynamic="force-dynamic";
export function GET(){return NextResponse.json({enabled:ctbcEnabled()},{headers:{"Cache-Control":"no-store"}});}
