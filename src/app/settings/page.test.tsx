// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "@/app/settings/page";

const { mockReplace, fetchSettingsData } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  fetchSettingsData: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/lib/data", () => ({
  fetchSettingsData,
}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      }),
    },
  }),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSettingsData.mockResolvedValue({
      user: { email: "demo@example.com" },
      overview: {
        groupCount: 2,
        categoryCount: 6,
        quickCategoryCount: 4,
        paymentMethodCount: 3,
      },
      categories: [],
      paymentMethods: [],
    });
  });

  it("renders the simplified guidance page", async () => {
    render(createElement(SettingsPage));

    await screen.findByText("這頁先保留為說明中心");

    expect(screen.getByText("常用功能已回到主流程")).toBeInTheDocument();
    expect(screen.getByText("首頁：管理快速記帳與支付方式")).toBeInTheDocument();
    expect(screen.getByText("快速記帳頁：適合手機捷徑直接開啟")).toBeInTheDocument();
  });
});
