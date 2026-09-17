// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReportCharts, spendingChangeLabel } from "@/components/ReportCharts";
import { computeReportData, computeReportTrend } from "@/lib/reportData";

afterEach(cleanup);
const emptyCollections = { groups: [], categories: [], paymentMethods: [], incomes: [], budgets: [], transactions: [] };
const emptyReport = computeReportData(emptyCollections);

describe("report charts", () => {
  it("explains zero baselines without dividing by zero", () => {
    expect(spendingChangeLabel(0, 0)).toBe("與前月相同");
    expect(spendingChangeLabel(100, 0)).toContain("前月無支出");
    expect(spendingChangeLabel(0, 100)).toContain("100.0%");
    expect(spendingChangeLabel(120, 100)).toContain("20.0%");
    expect(spendingChangeLabel(80, 100)).toContain("減少");
  });

  it("shows an empty donut, six accessible month values, and a partial-month explanation", () => {
    const report = { ...emptyReport, trend: computeReportTrend(emptyCollections, "2025-11", "2026-04") };
    render(<ReportCharts data={report} monthId="2026-04" currentMonthId="2026-04" />);
    expect(screen.getByText("這個月還沒有支出紀錄")).toBeInTheDocument();
    expect(screen.getByText(/本月尚未結束，以下/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "每月支出" })).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByRole("listitem", { name: /2025 年 11 月/ })).toBeInTheDocument();
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });

  it("keeps group colors when monthly spending rank changes and gives new groups different colors", () => {
    const groups = ["個人", "家庭", "吉他", "其他", "新項目甲", "新項目乙"].map((name, index) => ({
      id: `group-${index}`, name, allocated: 0, spent: index + 1, remaining: 0,
      transactionCount: 1, previousSpent: 0, deltaSpent: index + 1,
    }));
    const report = { ...emptyReport, categoryGroups: groups };
    const { container, rerender } = render(<ReportCharts data={report} monthId="2026-04" currentMonthId="2026-06" />);
    function legendColors() {
      return new Map(Array.from(container.querySelectorAll('ul[aria-label="各大項支出金額與占比"] li')).map((row) => [row.children[1].textContent, row.children[0].className]));
    }
    const before = legendColors();
    expect(new Set(before.values()).size).toBe(6);
    expect(screen.getByText("28.6%")).toBeInTheDocument();
    rerender(<ReportCharts data={{ ...report, categoryGroups: groups.map((group) => ({ ...group, spent: 10 - group.spent })) }} monthId="2026-05" currentMonthId="2026-06" />);
    expect(legendColors()).toEqual(before);
    expect(screen.queryByText(/本月尚未結束，以下/)).not.toBeInTheDocument();
  });

  it("does not label the unfinished previous month as a full month when viewing a future month", () => {
    render(<ReportCharts data={emptyReport} monthId="2026-05" currentMonthId="2026-04" />);
    expect(screen.getByText(/所選月份尚未開始/)).toBeInTheDocument();
    expect(screen.getByText("2026 年 4 月（進行中）")).toBeInTheDocument();
    expect(screen.getByText("2026 年 5 月（尚未開始）")).toBeInTheDocument();
  });
});
