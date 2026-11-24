import type { BudgetUsageData, BudgetUsageItem } from "@/lib/types";

export type MonthView = {
  /** 本月可用預算（含上月結轉） */
  available: number;
  spent: number;
  /** available - spent；負數代表超支 */
  remaining: number;
  /** 已花比例 0–100，用於進度條 */
  percent: number;
  /** 只在「當月」且還有餘額時提供：平均每天還能花多少 */
  dailyAllowance: number | null;
  /** 只在「當月」提供：含今天在內，本月還剩幾天 */
  daysLeft: number | null;
  /** 有預算或有花費的分類；超支的排最前面，其餘依使用比例高到低 */
  items: BudgetUsageItem[];
};

function getDaysInMonth(monthId: string) {
  const [year, month] = monthId.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

/** 把預算使用資料整理成「本月」頁要顯示的內容。today 為 YYYY-MM-DD（台北時間）。 */
export function buildMonthView(data: BudgetUsageData, today: string): MonthView {
  const items = data.groups
    .flatMap((group) => group.categories)
    .filter((item) => item.allocated + item.carryover > 0 || item.spent > 0)
    .sort((a, b) => {
      if (a.isOverspent !== b.isOverspent) return a.isOverspent ? -1 : 1;
      return b.usageRate - a.usageRate;
    });

  const available = items.reduce((sum, item) => sum + item.allocated + item.carryover, 0);
  const spent = items.reduce((sum, item) => sum + item.spent, 0);
  const remaining = available - spent;
  const percent =
    available > 0 ? Math.max(0, Math.min(100, Math.round((spent / available) * 100))) : 0;

  const isCurrentMonth = today.slice(0, 7) === data.monthId;
  const daysLeft = isCurrentMonth
    ? getDaysInMonth(data.monthId) - Number(today.slice(8, 10)) + 1
    : null;
  const dailyAllowance =
    daysLeft !== null && daysLeft > 0 && remaining > 0 ? Math.floor(remaining / daysLeft) : null;

  return { available, spent, remaining, percent, dailyAllowance, daysLeft, items };
}
