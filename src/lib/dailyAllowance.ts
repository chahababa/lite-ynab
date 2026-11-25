export type DailyAllowanceInput = {
  /** 本月可用額度 */
  available: number;
  /** 本月已支出（含今天） */
  spent: number;
  /** 今天已支出 */
  spentToday?: number;
};

export type DailyAllowance = {
  /** 本月剩餘天數，含今天 */
  daysLeft: number;
  /** 把「今天以前剩下的預算」平均分到剩餘天數，一天可以花多少 */
  perDay: number;
  /** 今天還能花多少；負數代表今天已經超過 */
  todayLeft: number;
};

/**
 * 「今天還能花多少」：只在看的是「今天所在的月份」、該分類有預算、而且整個月還沒超支時才有意義，
 * 其他情況回傳 null，畫面改顯示整月的剩餘或超支。
 */
export function computeDailyAllowance(
  status: DailyAllowanceInput | undefined,
  monthId: string,
  today: string,
): DailyAllowance | null {
  if (!status || status.available <= 0) return null;
  if (today.slice(0, 7) !== monthId) return null;
  if (status.available - status.spent < 0) return null;

  const [year, month, day] = today.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysLeft = daysInMonth - day + 1;
  const spentToday = status.spentToday ?? 0;
  const leftBeforeToday = status.available - (status.spent - spentToday);
  const perDay = Math.floor(leftBeforeToday / daysLeft);

  return { daysLeft, perDay, todayLeft: perDay - spentToday };
}

export type SpendingReminder = { text: string; isWarning: boolean };

const money = (value: number) => `$${Math.abs(value).toLocaleString("en-US")}`;

/** 記完一筆之後的一句話提醒：今天還能花多少，或已經超過多少。沒有預算就不提醒。 */
export function describeSpendingReminder(
  status: DailyAllowanceInput | undefined,
  daily: DailyAllowance | null | undefined,
): SpendingReminder | null {
  if (!status || status.available <= 0) return null;

  const monthLeft = status.available - status.spent;
  if (monthLeft < 0) {
    return { text: `這個月已超支 ${money(monthLeft)}，今天盡量別再花這一項。`, isWarning: true };
  }
  if (!daily) return null;

  return daily.todayLeft >= 0
    ? { text: `今天還能花 ${money(daily.todayLeft)}（平均一天 ${money(daily.perDay)}）。`, isWarning: false }
    : { text: `今天已超過當日額度 ${money(daily.todayLeft)}，這個月還剩 ${money(monthLeft)}。`, isWarning: true };
}
