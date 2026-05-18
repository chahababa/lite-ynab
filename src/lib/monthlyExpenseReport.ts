import { formatInTimeZone } from "date-fns-tz";

import type { ReportBreakdownItem, ReportData, TransactionWithCategory } from "./types";
import { formatMonthLabel, shiftMonth } from "./utils";

const TAIPEI_TIMEZONE = "Asia/Taipei";
const HIGH_USAGE_THRESHOLD = 0.8;
const TOP_EXPENSE_LIMIT = 5;

export type MonthlyReportStatus =
  | { kind: "remaining"; amount: number }
  | { kind: "overspent"; amount: number }
  | { kind: "balanced"; amount: 0 };

export type MonthlyReportBreakdownItem = {
  id: string;
  name: string;
  groupName?: string;
  budget: number;
  spent: number;
  remaining: number;
  transactionCount: number;
  share: number;
  usageRate: number | null;
};

export type MonthlyReportExpenseItem = {
  id: string;
  date: string;
  title: string;
  amount: number;
  categoryName: string;
  groupName: string;
  paymentMethodName: string;
};

export type MonthlyReportOverspentAlert = {
  id: string;
  name: string;
  groupName?: string;
  budget: number;
  spent: number;
  overspent: number;
  usageRate: number | null;
};

export type MonthlyReportHighUsageAlert = {
  id: string;
  name: string;
  groupName?: string;
  budget: number;
  spent: number;
  remaining: number;
  usageRate: number;
};

export type MonthlyExpenseReport = {
  monthId: string;
  monthLabel: string;
  generatedAt: string;
  totalSpent: number;
  totalBudget: number;
  remaining: number;
  status: MonthlyReportStatus;
  transactionCount: number;
  groupBreakdown: MonthlyReportBreakdownItem[];
  categoryBreakdown: MonthlyReportBreakdownItem[];
  topExpenses: MonthlyReportExpenseItem[];
  overspentAlerts: MonthlyReportOverspentAlert[];
  highUsageAlerts: MonthlyReportHighUsageAlert[];
};

export function getPreviousMonthIdInTaipei(now: Date = new Date()): string {
  const currentMonthId = formatInTimeZone(now, TAIPEI_TIMEZONE, "yyyy-MM");
  return shiftMonth(currentMonthId, -1);
}

export function buildMonthlyExpenseReport(
  data: ReportData,
  options?: {
    generatedAt?: string;
  },
): MonthlyExpenseReport {
  const monthId = data.period.startMonthId;
  const totalSpent = data.summary.spent;
  const totalBudget = data.summary.allocated;
  const remaining = totalBudget - totalSpent;
  const generatedAt = options?.generatedAt ?? formatInTimeZone(new Date(), TAIPEI_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");

  return {
    monthId,
    monthLabel: formatMonthLabel(monthId),
    generatedAt,
    totalSpent,
    totalBudget,
    remaining,
    status: buildStatus(remaining),
    transactionCount: data.summary.transactionCount,
    groupBreakdown: buildBreakdown(data.categoryGroups, totalSpent),
    categoryBreakdown: buildBreakdown(data.categories, totalSpent),
    topExpenses: buildTopExpenses(data.recentTransactions),
    overspentAlerts: buildOverspentAlerts(data.categories),
    highUsageAlerts: buildHighUsageAlerts(data.categories),
  };
}

export function formatMonthlyExpenseReportForTelegram(report: MonthlyExpenseReport): string {
  const topExpenses = report.topExpenses.length
    ? report.topExpenses
        .map((item, index) => `${index + 1}. ${item.title} ${formatTwd(item.amount)}（${item.categoryName}）`)
        .join("\n")
    : "無交易";

  const groupShares = report.groupBreakdown.length
    ? report.groupBreakdown
        .slice(0, 5)
        .map((item) => `${item.name} ${formatPercent(item.share)}（${formatTwd(item.spent)}）`)
        .join("、")
    : "無支出";

  const categoryShares = report.categoryBreakdown.length
    ? report.categoryBreakdown
        .slice(0, 5)
        .map((item) => `${item.name} ${formatPercent(item.share)}（${formatTwd(item.spent)}）`)
        .join("、")
    : "無支出";

  const overspentText = report.overspentAlerts.length
    ? report.overspentAlerts
        .map((item) => `${item.name}超支 ${formatTwd(item.overspent)}`)
        .join("、")
    : "無";

  const highUsageText = report.highUsageAlerts.length
    ? report.highUsageAlerts.map((item) => `${item.name} ${formatPercent(item.usageRate)}`).join("、")
    : "無";

  return [
    `LiteYNAB ${report.monthId} 月報`,
    `總支出：${formatTwd(report.totalSpent)}`,
    `總預算：${formatTwd(report.totalBudget)}`,
    `${formatStatusLabel(report.status)}：${formatTwd(report.status.amount)}`,
    `交易筆數：${report.transactionCount}`,
    `大項佔比：${groupShares}`,
    `小項佔比：${categoryShares}`,
    "Top 5 支出：",
    topExpenses,
    `超支提醒：${overspentText}`,
    `80% 注意：${highUsageText}`,
  ].join("\n");
}

export function buildMonthlyReportPlainSummary(report: MonthlyExpenseReport): string {
  const overspentText = report.overspentAlerts.length
    ? report.overspentAlerts.map((item) => `${item.name}超支${formatTwd(item.overspent)}`).join("、")
    : "無超支";
  const highUsageText = report.highUsageAlerts.length
    ? report.highUsageAlerts.map((item) => `${item.name}${formatPercent(item.usageRate)}`).join("、")
    : "無 80% 以上項目";

  return `${report.monthId}：支出 ${formatTwd(report.totalSpent)} / 預算 ${formatTwd(
    report.totalBudget,
  )}，${formatStatusLabel(report.status)} ${formatTwd(report.status.amount)}。${overspentText}；${highUsageText}。`;
}

function buildStatus(remaining: number): MonthlyReportStatus {
  if (remaining > 0) {
    return { kind: "remaining", amount: remaining };
  }

  if (remaining < 0) {
    return { kind: "overspent", amount: Math.abs(remaining) };
  }

  return { kind: "balanced", amount: 0 };
}

function buildBreakdown(items: ReportBreakdownItem[], totalSpent: number): MonthlyReportBreakdownItem[] {
  return items
    .map((item) => ({
      id: item.id,
      name: item.name,
      groupName: item.groupName,
      budget: item.allocated,
      spent: item.spent,
      remaining: item.remaining,
      transactionCount: item.transactionCount,
      share: totalSpent > 0 ? item.spent / totalSpent : 0,
      usageRate: item.allocated > 0 ? item.spent / item.allocated : null,
    }))
    .sort((left, right) => {
      if (right.spent !== left.spent) {
        return right.spent - left.spent;
      }

      return left.name.localeCompare(right.name, "zh-Hant");
    });
}

function buildTopExpenses(transactions: TransactionWithCategory[]): MonthlyReportExpenseItem[] {
  return [...transactions]
    .sort((left, right) => {
      if (right.amount !== left.amount) {
        return right.amount - left.amount;
      }

      return left.date.localeCompare(right.date);
    })
    .slice(0, TOP_EXPENSE_LIMIT)
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      title: transaction.note.trim() || transaction.categoryName,
      amount: transaction.amount,
      categoryName: transaction.categoryName,
      groupName: transaction.categoryGroupName,
      paymentMethodName: transaction.paymentMethodName,
    }));
}

function buildOverspentAlerts(items: ReportBreakdownItem[]): MonthlyReportOverspentAlert[] {
  return items
    .filter((item) => item.allocated > 0 && item.spent > item.allocated)
    .map((item) => ({
      id: item.id,
      name: item.name,
      groupName: item.groupName,
      budget: item.allocated,
      spent: item.spent,
      overspent: item.spent - item.allocated,
      usageRate: item.spent / item.allocated,
    }))
    .sort((left, right) => {
      if (right.overspent !== left.overspent) {
        return right.overspent - left.overspent;
      }

      return left.name.localeCompare(right.name, "zh-Hant");
    });
}

function buildHighUsageAlerts(items: ReportBreakdownItem[]): MonthlyReportHighUsageAlert[] {
  return items
    .filter((item) => item.allocated > 0 && item.spent <= item.allocated && item.spent / item.allocated >= HIGH_USAGE_THRESHOLD)
    .map((item) => ({
      id: item.id,
      name: item.name,
      groupName: item.groupName,
      budget: item.allocated,
      spent: item.spent,
      remaining: item.allocated - item.spent,
      usageRate: item.spent / item.allocated,
    }))
    .sort((left, right) => {
      if (right.usageRate !== left.usageRate) {
        return right.usageRate - left.usageRate;
      }

      return right.spent - left.spent;
    });
}

function formatTwd(amount: number): string {
  return `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amount)}`;
}

function formatStatusLabel(status: MonthlyReportStatus) {
  switch (status.kind) {
    case "remaining":
      return "剩餘";
    case "overspent":
      return "超支";
    case "balanced":
      return "剛好打平";
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
