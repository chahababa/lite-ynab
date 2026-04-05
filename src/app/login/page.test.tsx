// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";

const { mockReplace, mockRefresh, mockGetSession, mockSignInWithPassword, mockSignUp } = vi.hoisted(
  () => ({
    mockReplace: vi.fn(),
    mockRefresh: vi.fn(),
    mockGetSession: vi.fn(),
    mockSignInWithPassword: vi.fn(),
    mockSignUp: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    refresh: mockRefresh,
  }),
}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
    },
  }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: {
        session: null,
      },
    });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockSignUp.mockResolvedValue({
      error: null,
      data: {
        session: {
          access_token: "token",
        },
      },
    });
  });

  it("submits login and redirects to dashboard", async () => {
    render(createElement(LoginPage));

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "demo@example.com" },
    });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "secret12" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "登入" })[1]);

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "demo@example.com",
        password: "secret12",
      });
      expect(mockReplace).toHaveBeenCalledWith("/");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
