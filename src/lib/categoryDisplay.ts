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

// 使用者習慣在名稱尾端加的「色塊記號」；格子本身已用顏色區分大項，短名稱就不再重複顯示
const COLOR_MARKER_PATTERN = /[🟥🟧🟨🟩🟦🟪🟫⬛⬜🔴🟠🟡🟢🔵🟣🟤⚫⚪]/gu;
const GROUP_SEPARATOR_PATTERN = /^[\s\-－–—_/／・:：]+/u;

/**
 * 記一筆格子用的短名稱：拿掉開頭重複的大項名稱（「個人-飲食🟩」→「飲食」）與色塊記號。
 * 只影響顯示，不改資料；拿掉後若變成空字串就退回原名稱。
 */
export function getShortCategoryName(name: string, groupName?: string): string {
  let short = name.replace(COLOR_MARKER_PATTERN, "").trim();
  const group = groupName?.trim();
  if (group && short.startsWith(group)) {
    const rest = short.slice(group.length);
    if (GROUP_SEPARATOR_PATTERN.test(rest)) {
      short = rest.replace(GROUP_SEPARATOR_PATTERN, "").trim();
    }
  }
  return short || name;
}
