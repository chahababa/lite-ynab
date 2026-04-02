export function LoadingCard({ label = "載入中..." }: { label?: string }) {
  return (
    <div className="rounded-[28px] border border-ink/10 bg-white/70 p-6 text-sm text-ink/60 shadow-sm">
      {label}
    </div>
  );
}
