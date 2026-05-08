export function LoadingCard({ label = "載入中..." }: { label?: string }) {
  return (
    <div className="rounded-md border border-outline bg-surface px-5 py-6">
      <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
        Loading
      </p>
      <p className="mt-2 text-body-md text-on-surface">{label}</p>
    </div>
  );
}
