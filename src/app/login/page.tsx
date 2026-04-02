"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, UserRoundPlus } from "lucide-react";

import { Toast } from "@/components/Toast";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { ToastState } from "@/lib/types";

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
    const timer = toast
      ? window.setTimeout(() => setToast(null), 2800)
      : undefined;

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [toast]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
      }
    });
  }, [router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        router.replace("/");
        router.refresh();
        return;
      }

      const { error, data } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        router.replace("/");
        router.refresh();
      } else {
        setToast({
          tone: "info",
          message: "註冊成功，若啟用信箱驗證請先完成驗證。",
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "登入失敗，請稍後再試。";
      setToast({
        tone: "error",
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

      <div className="overflow-hidden rounded-[36px] border border-ink/10 bg-white/80 shadow-float backdrop-blur">
        <div className="bg-ink px-6 py-8 text-paper">
          <p className="text-xs uppercase tracking-[0.32em] text-paper/60">Lite YNAB</p>
          <h1 className="mt-3 font-display text-4xl">把每月薪水，分配到能安心的地方。</h1>
          <p className="mt-3 text-sm text-paper/75">
            單一帳號版本，先登入再開始編預算與快速記帳。
          </p>
        </div>

        <div className="p-6">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-paper p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                mode === "login" ? "bg-white text-ink shadow-sm" : "text-ink/55"
              }`}
            >
              已有帳號
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                mode === "signup" ? "bg-white text-ink shadow-sm" : "text-ink/55"
              }`}
            >
              建立帳號
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm text-ink/70">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 outline-none transition focus:border-mint"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-ink/70">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 outline-none transition focus:border-mint"
                placeholder="至少 6 碼"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sun px-4 py-3 font-medium text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {mode === "login" ? (
                <KeyRound className="h-4 w-4" />
              ) : (
                <UserRoundPlus className="h-4 w-4" />
              )}
              {isSubmitting ? "處理中..." : mode === "login" ? "登入" : "建立帳號"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
