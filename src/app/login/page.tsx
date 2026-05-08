"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, UserRoundPlus } from "lucide-react";

import { Toast } from "@/components/Toast";
import { Button as M3Button } from "@/components/m3/Button";
import { TextField } from "@/components/m3/TextField";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { ToastState } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
        return;
      }

      const { error, data } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      if (data.session) {
        router.replace("/");
        router.refresh();
      } else {
        setToast({ tone: "info", message: "註冊成功，如需驗證請到信箱完成確認。" });
      }
    } catch {
      setToast({
        tone: "error",
        message: mode === "login" ? "登入失敗，請再試一次。" : "註冊失敗，請再試一次。",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background font-sans text-on-surface">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
        <div className="rounded-md border border-outline bg-surface shadow-elev-1 overflow-hidden">
          {/* Header — primary container */}
          <div className="bg-primary-container px-6 py-8">
            <p className="text-label-sm uppercase tracking-[0.18em] text-primary-on-container/70">
              Lite YNAB
            </p>
            <h1 className="mt-3 text-headline-md text-primary-on-container">
              先規劃本月預算，再安心記下每天支出。
            </h1>
            <p className="mt-3 text-body-md text-primary-on-container/80">
              登入後就能設定大項與小項分類、安排每月預算，並用最快的方式完成記帳。
            </p>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* Mode segments */}
            <div className="mb-5 flex rounded-full bg-surface-container p-[3px]">
              {(["login", "signup"] as const).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex-1 h-9 rounded-full text-body-md font-medium transition-colors duration-m3-short",
                      active
                        ? "bg-surface text-on-surface shadow-elev-1"
                        : "bg-transparent text-on-surface-variant",
                    )}
                  >
                    {m === "login" ? "登入" : "建立帳號"}
                  </button>
                );
              })}
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <TextField
                label="電子郵件"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="請輸入電子郵件"
              />
              <TextField
                label="密碼"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 個字元"
                helperText="密碼需要至少 6 個字元"
              />

              <M3Button
                type="submit"
                variant="filled"
                disabled={isSubmitting}
                className="w-full h-12 text-body-lg"
                startIcon={
                  mode === "login" ? (
                    <KeyRound className="h-[18px] w-[18px]" />
                  ) : (
                    <UserRoundPlus className="h-[18px] w-[18px]" />
                  )
                }
              >
                {isSubmitting
                  ? "處理中..."
                  : mode === "login"
                    ? "登入"
                    : "建立帳號"}
              </M3Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
