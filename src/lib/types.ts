export type CategoryGroup = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
};

export type Category = {
  id: string;
  user_id: string;
  category_group_id: string;
  name: string;
  is_auto: boolean;
  auto_amount: number;
  is_quick: boolean;
  sort_order: number;
};

export type PaymentMethod = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
};

export type MonthlyIncome = {
  id: string;
  user_id: string;
  month_id: string;
  amount: number;
};

export type Budget = {
  id: string;
  user_id: string;
  month_id: string;
  category_id: string;
  allocated: number;
};

export type TransactionSource = "legacy" | "manual" | "ynab_import" | "hermes";

export type Transaction = {
  id: string;
  user_id: string;
  date: string;
  amount: number;
  category_id: string;
  payment_method_id: string;
  note: string;
  source: TransactionSource;
  source_text: string | null;
  source_id: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
};

export type BudgetRow = {
  budgetId: string;
  categoryId: string;
  categoryGroupId: string;
  categoryGroupName: string;
  categoryName: string;
  allocated: number;
  carryover: number;
  spent: number;
  remaining: number;
  isQuick: boolean;
  isAuto: boolean;
  autoAmount: number;
  warning: string | null;
};

export type CategoryOption = {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  isQuick: boolean;
  isAuto: boolean;
  autoAmount: number;
  sortOrder: number;
};

export type PaymentMethodOption = {
  id: string;
  name: string;
  sortOrder: number;
};

export type TransactionWithCategory = Transaction & {
  categoryGroupName: string;
  categoryName: string;
  paymentMethodName: string;
};

export type ReportSummary = {
  income: number;
  allocated: number;
  spent: number;
  unallocated: number;
  remainingAfterSpending: number;
  transactionCount: number;
  overspentCount: number;
  previousSpent: number;
  deltaSpent: number;
};

export type ReportBreakdownItem = {
  id: string;
  name: string;
  /** 只有 category-level row 會有；group-level row 不需要。 */
  groupName?: string;
  allocated: number;
  spent: number;
  remaining: number;
  transactionCount: number;
  previousSpent: number;
  deltaSpent: number;
};

export type PaymentMethodReportItem = {
  id: string;
  name: string;
  spent: number;
  transactionCount: number;
  previousSpent: number;
  deltaSpent: number;
  share: number;
};

export type ReportTrendPoint = {
  monthId: string;
  label: string;
  income: number;
  allocated: number;
  spent: number;
  unallocated: number;
};

export type ReportGroupDetail = {
  group: ReportBreakdownItem;
  categories: ReportBreakdownItem[];
};

export type ReportPeriod = {
  mode: "month" | "range";
  startMonthId: string;
  endMonthId: string;
  monthCount: number;
  previousStartMonthId: string;
  previousEndMonthId: string;
};

export type SettingsCategoryItem = {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  isQuick: boolean;
  isAuto: boolean;
  autoAmount: number;
  sortOrder: number;
};

export type SettingsOverview = {
  groupCount: number;
  categoryCount: number;
  quickCategoryCount: number;
  paymentMethodCount: number;
};

export type ReportData = {
  period: ReportPeriod;
  summary: ReportSummary;
  categoryGroups: ReportBreakdownItem[];
  groupDetails: ReportGroupDetail[];
  categories: ReportBreakdownItem[];
  paymentMethods: PaymentMethodReportItem[];
  trend: ReportTrendPoint[];
  recentTransactions: TransactionWithCategory[];
};

export type BudgetUsageScope = "today" | "month";

export type BudgetUsageItem = {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  allocated: number;
  carryover: number;
  spent: number;
  remaining: number;
  usageRate: number;
  isOverspent: boolean;
};

export type BudgetUsageGroup = {
  id: string;
  name: string;
  allocated: number;
  carryover: number;
  spent: number;
  remaining: number;
  hasOverspentItem: boolean;
  categories: BudgetUsageItem[];
};

export type BudgetUsageSummary = {
  spent: number;
  remaining: number;
  overspentCount: number;
};

export type BudgetUsageData = {
  monthId: string;
  scope: BudgetUsageScope;
  summary: BudgetUsageSummary;
  groups: BudgetUsageGroup[];
};

export type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
} | null;
