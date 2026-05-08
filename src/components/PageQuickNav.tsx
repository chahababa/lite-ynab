"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  Home,
  LayoutDashboard,
  LogOut,
  PieChart,
  ReceiptText,
  Settings,
  WalletCards,
  X,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

const QUICK_LINKS = [
  { href: "/", label: "主控臺", icon: Home },
  { href: "/quick-entry", label: "快速記帳", icon: WalletCards },
  { href: "/budget-allocation", label: "預算分配", icon: LayoutDashboard },
  { href: "/budget-usage", label: "預算使用", icon: PieChart },
  { href: "/transactions", label: "交易列表", icon: ReceiptText },
  { href: "/reports", label: "報表", icon: BarChart3 },
  { href: "/settings", label: "設定", icon: Settings },
];

export function PageQuickNav() {
  const pathname = usePathname();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const supabase = useRef(getSupabaseBrowserClient()).current;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (active) {
        setEmail(user?.email ?? "");
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? "");
    });

    void loadUser();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (pathname === "/login") {
    return null;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setOpen(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[999]">
      <div className="mx-auto w-full max-w-md px-3">
        <div ref={containerRef} className="pointer-events-auto flex justify-start">
          <div className="relative">
            {open ? (
              <div className="mb-2 w-60 rounded-md border border-outline bg-surface p-2 shadow-elev-3">
                <div className="rounded-sm bg-surface-container px-3 py-2">
                  <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                    帳號
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-mono text-body-sm tabular-nums text-on-surface">
                      {email || "尚未載入"}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/5 active:bg-on-surface/10"
                      aria-label="登出"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-1">
                  {pathname !== "/" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.back();
                      }}
                      className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-body-sm text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10"
                    >
                      <ChevronLeft className="h-4 w-4 shrink-0" />
                      <span>返回上一頁</span>
                    </button>
                  ) : null}

                  {QUICK_LINKS.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-on-surface hover:bg-on-surface/5 active:bg-on-surface/10",
                          isActive && "bg-primary-container text-primary-on-container font-medium",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              aria-label={open ? "關閉頁面選單" : "打開頁面選單"}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-body-md font-medium text-primary-on shadow-elev-2 transition-colors duration-m3-short hover:bg-primary/90 active:bg-primary/80"
            >
              {open ? <X className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span>頁面選單</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
