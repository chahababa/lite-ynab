export type Category = {
  id: string;
  user_id: string;
  name: string;
  is_auto: boolean;
  auto_amount: number;
  is_quick: boolean;
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

export type Transaction = {
  id: string;
  user_id: string;
  date: string;
  amount: number;
  category_id: string;
  note: string;
  created_at?: string;
};

export type BudgetRow = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  allocated: number;
  spent: number;
  remaining: number;
  isQuick: boolean;
  isAuto: boolean;
  warning: string | null;
};

export type TransactionWithCategory = Transaction & {
  categoryName: string;
};

export type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
} | null;
