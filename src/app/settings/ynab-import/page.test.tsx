// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import YnabImportPage from "@/app/settings/ynab-import/page";

const { mockReplace } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
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

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({
          data: {
            session: {
              user: {
                id: "user-1",
                email: "demo@example.com",
              },
            },
          },
        }),
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

describe("YnabImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the YNAB importer shell", async () => {
    render(createElement(YnabImportPage));

    await screen.findByText("YNAB 匯入器");

    expect(screen.getByText("先預覽，再正式匯入")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "讀取計畫" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "建立預覽" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("貼上你在 YNAB Developer Settings 產生的 Personal Access Token")).toBeInTheDocument();
  });
});
