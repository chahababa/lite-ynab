// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CtbcInboxShortcut } from "@/components/CtbcInboxShortcut";

const testState = vi.hoisted(() => ({
  pendingCount: null as number | null,
  autoImported: [] as { merchant: string; amount: number; categoryName: string; excluded?: boolean }[],
}));

vi.mock("@/lib/useCtbcPendingCount", () => ({
  useCtbcPendingCount: () => testState.pendingCount,
  useCtbcAutoImported: () => testState.autoImported,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

describe("CtbcInboxShortcut", () => {
  afterEach(() => {
    cleanup();
    testState.autoImported = [];
  });

  it("shows nothing when the inbox is off", () => {
    testState.pendingCount = null;
    const { container } = render(createElement(CtbcInboxShortcut));
    expect(container.firstElementChild).toBeNull();
  });

  it("shows a reminder linking to the inbox when items are pending", () => {
    testState.pendingCount = 15;
    render(createElement(CtbcInboxShortcut));

    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("去確認").closest("a")?.getAttribute("href")).toBe(
      "/settings/email-import",
    );
  });

  it("hides when nothing is pending, unless asked to keep the entry", () => {
    testState.pendingCount = 0;
    const { container } = render(createElement(CtbcInboxShortcut));
    expect(container.firstElementChild).toBeNull();
    cleanup();

    render(createElement(CtbcInboxShortcut, { showWhenEmpty: true }));
    expect(screen.getByText("目前沒有待確認的刷卡")).toBeInTheDocument();
  });

  it("tells you which charges were recorded automatically", () => {
    testState.pendingCount = 0;
    testState.autoImported = [
      { merchant: "５５６８８ＡＰＰ", amount: 265, categoryName: "個人-交通" },
      { merchant: "全家便利商店 板橋松翠店", amount: 80, categoryName: "個人-飲食" },
      { merchant: "NETFLIX.COM", amount: 560, categoryName: "Netflix_訂閱" },
      { merchant: "Spotify", amount: 298, categoryName: "Spotify 訂閱" },
      { merchant: "５５６８８ＡＰＰ", amount: 405, categoryName: "工作支出", excluded: true },
    ];
    render(createElement(CtbcInboxShortcut));

    const notice = screen.getByText(/已自動記帳/).closest("a");
    expect(notice).toHaveTextContent("已自動記帳 4 筆，共 $1,203；1 筆算工作、沒記帳");
    expect(notice).toHaveTextContent("５５６８８ＡＰＰ $265、全家便利商店 板橋松翠店 $80、NETFLIX.COM $560 …");
  });
});
