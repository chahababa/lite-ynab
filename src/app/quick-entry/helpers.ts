import { format } from "date-fns";

import type { M3CatColor } from "@/lib/categoryStyle";
import { getTodayInTaipei } from "@/lib/utils";

export const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"] as const;
// 兩格大的（最常用）＋三格小的；最後一格留給「其他分類」。
export const QUICK_GRID_SIZE = 5;

const GROUP_BADGE_COLOR_BY_NAME: Array<{ keywords: string[]; color: M3CatColor }> = [
  { keywords: ["個人", "personal"], color: "transport" },
  { keywords: ["家庭", "家", "home", "family"], color: "home" },
  { keywords: ["吉他", "音樂", "music", "guitar"], color: "fun" },
  { keywords: ["其他", "other"], color: "shop" },
];
const GROUP_BADGE_FALLBACK_COLORS: M3CatColor[] = ["food", "transport", "shop", "home", "health", "fun"];

export function getGroupBadgeColor(groupName: string): M3CatColor {
  const lower = groupName.toLowerCase();
  const matched = GROUP_BADGE_COLOR_BY_NAME.find((rule) =>
    rule.keywords.some((keyword) => lower.includes(keyword.toLowerCase())),
  );
  if (matched) return matched.color;

  const hash = Array.from(groupName).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return GROUP_BADGE_FALLBACK_COLORS[hash % GROUP_BADGE_FALLBACK_COLORS.length];
}

export function getGroupBadgeText(groupName: string): string {
  return Array.from(groupName.trim())[0] ?? "#";
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "載入快速記帳資料時發生未預期的錯誤。";
}

export function formatDateChipLabel(value: string): string {
  return value === getTodayInTaipei() ? "今天" : value;
}

export function shiftTaipeiDate(baseDate: string, daysAgo: number) {
  const [year, month, day] = baseDate.split("-").map(Number);
  return format(new Date(year, month - 1, day - daysAgo), "yyyy-MM-dd");
}

