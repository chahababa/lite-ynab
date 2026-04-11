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
              <div className="mb-2 w-56 chrome-window p-[6px]">
                <div className="space-y-2">
                  <div className="chrome-statusbar px-chrome-sm py-chrome-sm">
                    <p className="font-chrome-heading text-chrome-xs font-bold tracking-[0.16em] text-chrome-800">
                      帳號
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-chrome-mono text-chrome-sm text-chrome-900">
                        {email || "尚未載入"}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleSignOut()}
                        className="chrome-btn flex h-9 w-9 items-center justify-center px-0 py-0"
                        aria-label="登出"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {pathname !== "/" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.back();
                      }}
                      className="chrome-btn flex min-h-11 w-full items-center justify-start gap-3 px-3 py-2 text-left font-chrome-heading text-chrome-xs font-bold tracking-[0.08em]"
                    >
                      <ChevronLeft className="h-4 w-4 shrink-0" />
                      <span className="leading-tight">返回上一頁</span>
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
                          "chrome-btn flex min-h-11 w-full items-center justify-start gap-3 px-3 py-2 text-left font-chrome-heading text-chrome-xs font-bold tracking-[0.08em]",
                          isActive && "chrome-btn--success",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="leading-tight">{link.label}</span>
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
              className="chrome-btn chrome-btn--info flex min-h-12 min-w-[136px] items-center justify-center gap-2 px-4 py-3 text-sm font-bold tracking-[0.08em] shadow-[0_8px_18px_rgba(0,0,0,0.4)]"
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
