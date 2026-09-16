export type SpreadsheetValue = string | number | boolean | null;

const FORMULA_AFTER_OPTIONAL_WHITESPACE = /^[\s\ufeff]*[=+\-@]/u;

export function sanitizeSpreadsheetValue(value: SpreadsheetValue): SpreadsheetValue {
  if (typeof value !== "string") return value;

  return FORMULA_AFTER_OPTIONAL_WHITESPACE.test(value) ? `'${value}` : value;
}

export function toCsvCell(value: SpreadsheetValue): string {
  const text = String(sanitizeSpreadsheetValue(value) ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export function toHtmlTableCell(value: SpreadsheetValue): string {
  return String(sanitizeSpreadsheetValue(value) ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
