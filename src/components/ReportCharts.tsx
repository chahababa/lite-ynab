import type { ReportData } from "@/lib/types";
import { cn, formatCurrency, formatMonthLabel, shiftMonth } from "@/lib/utils";

const palette = ["text-cat-transport", "text-cat-home", "text-cat-food", "text-cat-shop", "text-cat-health", "text-cat-fun"];
const knownColors: Record<string, number> = { 個人: 0, 家庭: 1, 吉他: 5, 其他: 3 };

// Assign using all groups (including zero-spend groups), never by monthly rank.
function groupColors(groups: ReportData["categoryGroups"]) {
  const colors = new Map<string, string>();
  const used = new Set(groups.flatMap((group) => knownColors[group.name] === undefined ? [] : [knownColors[group.name]]));
  for (const group of [...groups].sort((a, b) => a.id.localeCompare(b.id))) {
    let index = knownColors[group.name];
    if (index === undefined) {
      const hash = Array.from(group.id).reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0, 0);
      index = hash % palette.length;
      for (let offset = 0; offset < palette.length; offset++) {
        const candidate = (index + offset) % palette.length;
        if (!used.has(candidate)) { index = candidate; break; }
      }
    }
    used.add(index);
    colors.set(group.id, palette[index]);
  }
  return colors;
}

export function spendingChangeLabel(spent: number, previousSpent: number) {
  const delta = spent - previousSpent;
  if (delta === 0) return "與前月相同";
  const change = `${delta > 0 ? "增加" : "減少"} ${formatCurrency(Math.abs(delta))}`;
  return previousSpent > 0
    ? `${change}（${(Math.abs(delta) / previousSpent * 100).toFixed(1)}%）`
    : `${change} · 前月無支出`;
}

export function ComparisonBars({ spent, previousSpent }: { spent: number; previousSpent: number }) {
  const maximum = Math.max(spent, previousSpent, 1);
  return (
    <div className="space-y-1.5" aria-hidden="true">
      <div className="h-2 overflow-hidden rounded-full bg-surface-container">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, spent) / maximum * 100}%` }} />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container">
        <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.max(0, previousSpent) / maximum * 100}%` }} />
      </div>
    </div>
  );
}

export function ReportCharts({ data, monthId, currentMonthId }: { data: ReportData; monthId: string; currentMonthId: string }) {
  const isCurrentMonth = monthId === currentMonthId;
  const isFutureMonth = monthId > currentMonthId;
  const previousMonthId = shiftMonth(monthId, -1);
  const monthStatus = (id: string) => id < currentMonthId ? "全月" : id === currentMonthId ? "進行中" : "尚未開始";
  const groups = data.categoryGroups.filter((group) => group.spent > 0).sort((a, b) => b.spent - a.spent);
  const total = groups.reduce((sum, group) => sum + group.spent, 0);
  const colors = groupColors(data.categoryGroups);
  const maxTrend = Math.max(...data.trend.map((point) => point.spent), 1);
  let offset = 0;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="report-comparison-title" className="min-w-0 rounded-md border border-outline bg-surface p-5 lg:col-span-2">
        <div className="grid gap-5 md:grid-cols-2 md:items-center">
          <div>
            <h2 id="report-comparison-title" className="text-title-md">與前月比較</h2>
            <p className={cn("mt-2 break-words text-title-lg", data.summary.deltaSpent > 0 ? "text-money-expense" : data.summary.deltaSpent < 0 ? "text-money-income" : "text-on-surface")}>
              {spendingChangeLabel(data.summary.spent, data.summary.previousSpent)}
            </p>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              {isFutureMonth ? "所選月份尚未開始，僅顯示目前已記錄資料；前月也可能尚未結束。" : isCurrentMonth ? "本月尚未結束，以下以目前已記錄支出與前月全月比較。" : "比較兩個月份的已記錄支出；旅遊等特殊月份可能影響結果。"}
            </p>
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap justify-between gap-2 text-body-md"><span>{formatMonthLabel(monthId)}{isCurrentMonth || isFutureMonth ? `（${monthStatus(monthId)}）` : ""}</span><span className="font-mono tabular-nums text-primary">{formatCurrency(data.summary.spent)}</span></div>
            <ComparisonBars spent={data.summary.spent} previousSpent={data.summary.previousSpent} />
            <div className="flex flex-wrap justify-between gap-2 text-body-md text-on-surface-variant"><span>{formatMonthLabel(previousMonthId)}（{monthStatus(previousMonthId)}）</span><span className="font-mono tabular-nums">{formatCurrency(data.summary.previousSpent)}</span></div>
            <p className="text-label-md text-on-surface-variant">藍色：所選月份　灰色：前月</p>
          </div>
        </div>
      </section>

      <figure className="min-w-0 rounded-md border border-outline bg-surface p-5">
        <figcaption className="text-title-md">支出分布</figcaption>
        <p className="mt-1 text-body-sm text-on-surface-variant">依大項分類，看錢主要花在哪裡</p>
        {total === 0 ? <p className="flex min-h-60 items-center justify-center text-body-md text-on-surface-variant">這個月還沒有支出紀錄</p> : (
          <div className="mt-5 grid items-center gap-5 sm:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[180px_minmax(0,1fr)]">
            <div className="relative mx-auto h-44 w-44">
              <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden="true">
                {groups.map((group) => {
                  const percentage = group.spent / total * 100;
                  const start = offset;
                  offset += percentage;
                  return <circle key={group.id} cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeWidth="25" pathLength="100" strokeDasharray={`${percentage} ${100 - percentage}`} strokeDashoffset={-start} className={colors.get(group.id)} />;
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <span className="text-label-md text-on-surface-variant">總支出</span>
                <span className="mt-1 max-w-full break-all font-mono text-title-md tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>
            <ul className="min-w-0 space-y-3" aria-label="各大項支出金額與占比">
              {groups.map((group) => <li key={group.id} className="flex items-start gap-2 text-body-md">
                <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-current", colors.get(group.id))} aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">{group.name}</span>
                <span className="shrink-0 text-right"><span className="block font-mono tabular-nums">{formatCurrency(group.spent)}</span><span className="text-body-sm text-on-surface-variant">{(group.spent / total * 100).toFixed(1)}%</span></span>
              </li>)}
            </ul>
          </div>
        )}
      </figure>

      <figure className="min-w-0 rounded-md border border-outline bg-surface p-5">
        <figcaption className="text-title-md">近六個月支出趨勢</figcaption>
        <p className="mt-1 text-body-sm text-on-surface-variant">金額：新臺幣 · 截至所選月份 · 無紀錄月份以 0 顯示{isCurrentMonth ? " · 本月尚未結束" : ""}</p>
        <div className="mt-6 grid grid-cols-6 items-end gap-1.5 sm:gap-3" role="list" aria-label="每月支出">
          {data.trend.map((point) => <div key={point.monthId} role="listitem" aria-label={`${point.label}：${formatCurrency(point.spent)}`} className="min-w-0 text-center">
            <div aria-hidden="true" className="flex h-44 flex-col justify-end">
              <span className="mb-2 break-all font-mono text-[10px] tabular-nums sm:text-body-sm" title={formatCurrency(point.spent)}><span className="sm:hidden">{new Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 }).format(point.spent)}</span><span className="hidden sm:inline">{formatCurrency(point.spent)}</span></span>
              <div className={cn("mx-auto w-full max-w-12 rounded-t-sm", point.monthId === monthId ? "bg-primary" : "bg-secondary-container")} style={{ height: `${Math.max(0, point.spent) / maxTrend * 120}px`, minHeight: "2px" }} />
            </div>
            <p aria-hidden="true" className={cn("border-t border-outline pt-2 text-body-sm", point.monthId === monthId ? "font-medium text-primary" : "text-on-surface-variant")}>
              <span className="block">{Number(point.monthId.slice(5))} 月</span><span className="text-[10px]">{point.monthId.slice(0, 4)}</span>
            </p>
          </div>)}
        </div>
        <p className="mt-5 text-body-sm text-on-surface-variant">藍色為所選月份。每月天數、旅遊與記帳完整度，都會影響支出總額。</p>
      </figure>
    </div>
  );
}
