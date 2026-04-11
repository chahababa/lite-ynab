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

  it("renders the chrome-styled settings overview", async () => {
    render(createElement(SettingsPage));

    await screen.findByText("目前的帳務骨架");

    expect(screen.getByText("從設定回到主要工作流")).toBeInTheDocument();
    expect(screen.getByText("回主控臺查看預算與最近交易")).toBeInTheDocument();
    expect(screen.getByText("前往快速記帳，立即新增一筆支出")).toBeInTheDocument();
  });
});
