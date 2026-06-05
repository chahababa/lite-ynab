// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageQuickNav } from "@/components/PageQuickNav";

const testState = vi.hoisted(() => ({
  pathname: "/",
  routerValue: {
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => testState.pathname,
  useRouter: () => testState.routerValue,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { email: "demo@example.com" } },
        }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      }),
      signOut: () => Promise.resolve({ error: null }),
    },
  }),
}));

describe("PageQuickNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.pathname = "/";
  });

  afterEach(() => {
    cleanup();
  });

  it("remains hidden on quick-entry", () => {
    testState.pathname = "/quick-entry";

    render(createElement(PageQuickNav));

    expect(screen.queryByRole("button", { name: "打開頁面選單" })).not.toBeInTheDocument();
  });

  it("hides the floating nav on desktop budget allocation to avoid table overlap", () => {
    testState.pathname = "/budget-allocation";

    const { container } = render(createElement(PageQuickNav));

    expect(screen.getByRole("button", { name: "打開頁面選單" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("lg:hidden");
  });
});