export function LoadingCard({ label = "載入中..." }: { label?: string }) {
  return (
    <div className="chrome-window p-[6px]">
      <div className="chrome-led-panel px-chrome-md py-chrome-lg">
        <p className="chrome-led-label text-chrome-sm uppercase">loading</p>
        <p className="mt-2 font-chrome-mono text-chrome-base text-chrome-300">{label}</p>
      </div>
    </div>
  );
}
