import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TAIPEI_TIMEZONE = "Asia/Taipei";

export function getTodayInTaipei(): string {
  return format(toZonedTime(new Date(), TAIPEI_TIMEZONE), "yyyy-MM-dd");
}

export function toMonthId(value?: string | Date): string {
  const date =
    typeof value === "string"
      ? parseISO(value.length === 7 ? `${value}-01` : value)
      : value ?? new Date();

  return format(toZonedTime(date, TAIPEI_TIMEZONE), "yyyy-MM");
}

export function shiftMonth(monthId: string, delta: number): string {
  const [year, month] = monthId.split("-").map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return format(shifted, "yyyy-MM");
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatMonthLabel(monthId: string): string {
  const [year, month] = monthId.split("-").map(Number);
  return `${year}年${month}月`;
}

export function monthDateRange(monthId: string): { start: string; end: string } {
  const [year, month] = monthId.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
  };
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
