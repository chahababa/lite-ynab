// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CtbcInboxShortcut } from "@/components/CtbcInboxShortcut";

const testState = vi.hoisted(() => ({ pendingCount: null as number | null }));

vi.mock("@/lib/useCtbcPendingCount", () => ({
  useCtbcPendingCount: () => testState.pendingCount,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

describe("CtbcInboxShortcut", () => {
  afterEach(() => cleanup());

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
});
