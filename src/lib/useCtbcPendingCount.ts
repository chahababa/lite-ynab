"use client";

import { useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

/**
 * 中信刷卡通知「待確認」筆數。
 * 功能沒開、沒登入或讀取失敗時回傳 null（呼叫端就不顯示入口）。
 * refreshKey 改變時會重新讀取（例如換頁後更新數字）。
 */
export function useCtbcPendingCount(refreshKey?: string): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const status = await fetch("/api/ctbc/status", { cache: "no-store" }).then((r) => r.json());
      if (!status.enabled) return;
      const session = await getSupabaseBrowserClient().auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/ctbc/inbox", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok && active) setCount((await response.json()).pendingCount);
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [refreshKey]);

  return count;
}
