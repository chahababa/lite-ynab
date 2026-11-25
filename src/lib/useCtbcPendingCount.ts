"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { CtbcAutoImported } from "@/lib/ctbcAutoRules";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

// 自動歸類每分鐘最多跑一次；同一時間多個元件一起載入時共用同一次請求。
const AUTO_INTERVAL_MS = 60_000;
let autoInFlight: Promise<void> | null = null;
let autoLastRunAt = 0;
let autoImported: CtbcAutoImported[] = [];
const autoListeners = new Set<() => void>();
const EMPTY: CtbcAutoImported[] = [];

function runAutoImport(token: string): Promise<void> {
  if (autoInFlight) return autoInFlight;
  if (Date.now() - autoLastRunAt < AUTO_INTERVAL_MS) return Promise.resolve();
  autoLastRunAt = Date.now();
  autoInFlight = fetch("/api/ctbc/auto", { method: "POST", cache: "no-store", headers: { Authorization: `Bearer ${token}` } })
    .then(async (response) => {
      if (!response.ok) return;
      const imported = ((await response.json()).imported ?? []) as CtbcAutoImported[];
      if (imported.length === 0) return;
      autoImported = [...autoImported, ...imported];
      autoListeners.forEach((listener) => listener());
    })
    // 自動歸類失敗不影響待確認清單，那些刷卡會照舊留著等使用者確認。
    .catch(() => {})
    .finally(() => {
      autoInFlight = null;
    });
  return autoInFlight;
}

/** 這次開 App 以來，被自動歸類補記的刷卡（給畫面顯示「已自動記帳 N 筆」）。 */
export function useCtbcAutoImported(): CtbcAutoImported[] {
  return useSyncExternalStore(
    (listener) => {
      autoListeners.add(listener);
      return () => autoListeners.delete(listener);
    },
    () => autoImported,
    () => EMPTY,
  );
}

/** 測試用：清掉模組內記住的狀態。 */
export function resetCtbcAutoImportForTest() {
  autoInFlight = null;
  autoLastRunAt = 0;
  autoImported = [];
}

/**
 * 中信刷卡通知「待確認」筆數。
 * 讀取前會先依自動歸類規則補記符合的刷卡，所以回傳的是「真的需要你確認」的筆數。
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
      await runAutoImport(token);
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
