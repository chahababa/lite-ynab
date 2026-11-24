// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BottomNav } from "@/components/BottomNav";

const testState = vi.hoisted(() => ({
  pathname: "/",
  pendingCount: null as number | null,
}));

vi.mock("@/lib/useCtbcPendingCount", () => ({
  useCtbcPendingCount: () => testState.pendingCount,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => testState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

describe("BottomNav", () => {
  beforeEach(() => {
    testState.pathname = "/";
    testState.pendingCount = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders three tabs with quick-entry as the primary center action", () => {
    render(createElement(BottomNav));

    expect(screen.getByRole("navigation", { name: "主要導覽" })).toBeInTheDocument();
    expect(screen.getByText("本月")).toBeInTheDocument();
    expect(screen.getByLabelText("記一筆").getAttribute("href")).toBe("/quick-entry");
    expect(screen.getByText("交易")).toBeInTheDocument();
  });

  it("marks the current page tab with aria-current", () => {
    testState.pathname = "/transactions";

    render(createElement(BottomNav));

    const active = screen.getByText("交易").closest("a");
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("stays hidden on login but shows on quick-entry (the landing page)", () => {
    testState.pathname = "/login";
    const { container } = render(createElement(BottomNav));
    expect(container.firstElementChild).toBeNull();
    cleanup();

    testState.pathname = "/quick-entry";
    render(createElement(BottomNav));
    expect(screen.getByRole("navigation", { name: "主要導覽" })).toBeInTheDocument();
  });

  it("links the month tab to /month", () => {
    render(createElement(BottomNav));
    expect(screen.getByText("本月").closest("a")?.getAttribute("href")).toBe("/month");
  });

  it("keeps three tabs when the card inbox is off", () => {
    render(createElement(BottomNav));
    expect(screen.queryByText("刷卡")).not.toBeInTheDocument();
    expect(screen.queryByText("設定")).not.toBeInTheDocument();
  });

  it("adds a card-inbox tab with a count badge when there are pending items", () => {
    testState.pendingCount = 15;
    render(createElement(BottomNav));

    const tab = screen.getByText("刷卡").closest("a");
    expect(tab?.getAttribute("href")).toBe("/settings/email-import");
    expect(tab).toHaveAttribute("aria-label", "刷卡，15 筆待確認");
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("設定").closest("a")?.getAttribute("href")).toBe("/settings");
  });

  it("shows the card-inbox tab without a badge when nothing is pending", () => {
    testState.pendingCount = 0;
    render(createElement(BottomNav));

    expect(screen.getByText("刷卡")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
