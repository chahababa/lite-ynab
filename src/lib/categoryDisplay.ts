/**
 * 偵測 categories 裡有重複 name 的（同樣名稱跨大項出現多次）。
 * 例如「個人/飲食」+「家庭/飲食」→ 「飲食」會被標示為 ambiguous。
 *
 * 接受任何有 `name` 欄位的 array，方便給 CategoryOption / BudgetUsageItem /
 * ReportBreakdownItem 等不同形狀重用。
 */
export function getAmbiguousCategoryNames(
  categories: Array<{ name: string }>,
): Set<string> {
  const counts = new Map<string, number>();
  for (const c of categories) {
    counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [name, count] of counts) {
    if (count > 1) dupes.add(name);
  }
  return dupes;
}

/**
 * 給 category 算出顯示用的 primary / secondary 文字。
 *  - primary：永遠是 category.name
 *  - secondary：只有當 name 跟其他大項重複時才回傳 groupName，否則 undefined
 *
 * 用法：
 *   const ambiguous = getAmbiguousCategoryNames(allCats);
 *   const display = getCategoryDisplay(cat, ambiguous);
 *   // display.secondary 有值才需要顯示群組前綴
 */
export function getCategoryDisplay(
  category: { name: string; groupName?: string },
  ambiguousNames: Set<string>,
): { primary: string; secondary?: string } {
  if (ambiguousNames.has(category.name) && category.groupName) {
    return { primary: category.name, secondary: category.groupName };
  }
  return { primary: category.name };
}
