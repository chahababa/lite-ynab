// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BottomNav } from "@/components/BottomNav";

const testState = vi.hoisted(() => ({
  pathname: "/",
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
  });

  afterEach(() => {
    cleanup();
  });

  it("renders five tabs with quick-entry as the primary center action", () => {
    render(createElement(BottomNav));

    expect(screen.getByRole("navigation", { name: "主要導覽" })).toBeInTheDocument();
    expect(screen.getByText("主控臺")).toBeInTheDocument();
    expect(screen.getByText("預算")).toBeInTheDocument();
    expect(screen.getByLabelText("記一筆").getAttribute("href")).toBe("/quick-entry");
    expect(screen.getByText("交易")).toBeInTheDocument();
    expect(screen.getByText("報表")).toBeInTheDocument();
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

  it("links the dashboard tab to /dashboard", () => {
    render(createElement(BottomNav));
    expect(screen.getByText("主控臺").closest("a")?.getAttribute("href")).toBe("/dashboard");
  });
});
