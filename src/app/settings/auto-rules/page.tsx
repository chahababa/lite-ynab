import { notFound } from "next/navigation";

import { ctbcEnabled } from "@/lib/ctbcInboxServer";

import { AutoRulesClient } from "./AutoRulesClient";

export const dynamic = "force-dynamic";

export default function AutoRulesPage() {
  if (!ctbcEnabled()) notFound();
  return <AutoRulesClient />;
}
