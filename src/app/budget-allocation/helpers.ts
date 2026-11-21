export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  // Supabase PostgrestError 不是 Error instance，但有 .message / .code / .details / .hint
  if (typeof error === "object" && error !== null) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    if (e.message) {
      const code = e.code ? ` (${e.code})` : "";
      const hint = e.hint ? ` — ${e.hint}` : "";
      return `${e.message}${code}${hint}`;
    }
  }
  return "發生未預期的錯誤";
}
