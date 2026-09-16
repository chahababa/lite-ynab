import { describe, expect, it } from "vitest";

import {
  sanitizeSpreadsheetValue,
  toCsvCell,
  toHtmlTableCell,
} from "./spreadsheetSafety";

describe("spreadsheet export safety", () => {
  it.each([
    "=1+1",
    "+SUM(A1:A2)",
    "-2+3",
    '@IMPORTXML("https://evil.test")',
    " =1+1",
    "\t=1+1",
    "\r\n@SUM(A1:A2)",
    "\u00a0+1",
    "\ufeff-1",
  ])("neutralizes formula-capable text %j", (value) => {
    expect(sanitizeSpreadsheetValue(value)).toBe(`'${value}`);
  });

  it("leaves numbers and ordinary text unchanged", () => {
    expect(sanitizeSpreadsheetValue(1200)).toBe(1200);
    expect(sanitizeSpreadsheetValue("早餐")).toBe("早餐");
  });

  it("quotes CSV after formula neutralization", () => {
    expect(toCsvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });

  it("escapes HTML after formula neutralization", () => {
    expect(toHtmlTableCell("=<script>alert(1)</script>")).toBe(
      "&#39;=&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });
});
