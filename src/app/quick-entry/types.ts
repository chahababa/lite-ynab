export type EntryType = "expense" | "income" | "transfer";
export type QuickTemplate = {
  id: string;
  label: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  paymentMethodId: string;
  paymentMethodName: string;
  note: string;
};
export type LastSavedTransaction = {
  amount: number;
  categoryName: string;
  paymentMethodName: string;
  note: string;
};
