export type AutoBudgetAdjustmentInput = {
  categoryName: string;
  isAuto: boolean;
  autoAmount: number;
  allocated: number;
};

export function buildAutoBudgetAdjustmentReminder({
  categoryName,
  isAuto,
  autoAmount,
  allocated,
}: AutoBudgetAdjustmentInput) {
  if (!isAuto || autoAmount <= 0 || allocated === autoAmount) {
    return null;
  }

  return `${categoryName} 本月預算和固定預算不同，系統會記錄這次手動調整；如果常常調整，建議更新固定預算。`;
}
