export type LastSavedTransaction = {
  /** 剛新增那筆交易的 id；有 id 才能在本頁原地復原。 */
  id: string | null;
  amount: number;
  categoryName: string;
  paymentMethodName: string;
  note: string;
};
