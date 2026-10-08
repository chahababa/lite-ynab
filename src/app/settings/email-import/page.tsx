import { notFound } from "next/navigation";
import { ctbcEnabled } from "@/lib/ctbcInboxServer";
import { CtbcInboxClient } from "./CtbcInboxClient";
export const dynamic = "force-dynamic";
export default function EmailImportPage() {
  if (!ctbcEnabled()) notFound();
  return <CtbcInboxClient />;
}
