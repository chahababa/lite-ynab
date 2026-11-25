// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoRulesClient } from "./AutoRulesClient";

const db = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; payload?: unknown }[],
  rules: [] as Record<string, unknown>[],
  failWrites: false,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => {
      const query = (op: string, payload?: unknown) => {
        if (op !== "select") db.calls.push({ table, op, payload });
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
        chain.then = (resolve: (value: unknown) => unknown) => {
          const data =
            op !== "select"
              ? null
              : table === "ctbc_auto_rules"
                ? db.rules
                : table === "category_groups"
                  ? [{ id: "g1", name: "個人", sort_order: 10 }]
                  : [{ id: "cat-food", name: "個人-飲食🟩", sort_order: 10, category_group_id: "g1" }];
          return Promise.resolve({ data, error: op !== "select" && db.failWrites ? { message: "boom" } : null }).then(resolve);
        };
        return chain;
      };
      return {
        select: () => query("select"),
        insert: (payload: unknown) => query("insert", payload),
        update: (payload: unknown) => query("update", payload),
        delete: () => query("delete"),
      };
    },
  }),
}));

describe("AutoRulesClient", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    db.calls = [];
    db.failWrites = false;
    db.rules = [
      { id: "r1", pattern: "全家", action: "import", category_id: "cat-food", max_amount: 1000, enabled: true },
      { id: "r2", pattern: "NETFLIX", action: "import", category_id: "cat-gone", max_amount: null, enabled: false },
      { id: "r3", pattern: "55688", action: "work", category_id: null, max_amount: null, enabled: true },
    ];
  });

  it("lists rules with their category, limit and state", async () => {
    render(createElement(AutoRulesClient));

    expect(await screen.findByLabelText("規則 全家")).toHaveTextContent("→ 個人・飲食・$1,000 以下");
    expect(screen.getByLabelText("規則 NETFLIX")).toHaveTextContent("（分類已刪除）・不限金額・已停用");
    expect(screen.getByLabelText("規則 55688")).toHaveTextContent("→ 算工作、不記帳・不限金額");
  });

  it("adds a rule with the chosen category and amount limit", async () => {
    render(createElement(AutoRulesClient));
    await screen.findByLabelText("規則 全家");

    fireEvent.change(screen.getByLabelText("商店名稱包含"), { target: { value: " 55688 " } });
    fireEvent.change(screen.getByLabelText("記到分類"), { target: { value: "cat-food" } });
    fireEvent.change(screen.getByLabelText("金額上限"), { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: "新增規則" }));

    expect(await screen.findByText("已新增規則「55688」。")).toBeInTheDocument();
    expect(db.calls).toEqual([
      { table: "ctbc_auto_rules", op: "insert", payload: { pattern: "55688", action: "import", category_id: "cat-food", max_amount: 800 } },
    ]);
  });

  it("adds a work rule without a category", async () => {
    render(createElement(AutoRulesClient));
    await screen.findByLabelText("規則 全家");

    fireEvent.change(screen.getByLabelText("商店名稱包含"), { target: { value: "優步福爾摩沙" } });
    fireEvent.change(screen.getByLabelText("記到分類"), { target: { value: "__work__" } });
    fireEvent.change(screen.getByLabelText("金額上限"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "新增規則" }));

    expect(await screen.findByText("已新增規則「優步福爾摩沙」。")).toBeInTheDocument();
    expect(db.calls.at(-1)).toEqual({
      table: "ctbc_auto_rules",
      op: "insert",
      payload: { pattern: "優步福爾摩沙", action: "work", category_id: null, max_amount: null },
    });
  });

  it("refuses an incomplete rule without writing anything", async () => {
    render(createElement(AutoRulesClient));
    await screen.findByLabelText("規則 全家");

    fireEvent.change(screen.getByLabelText("商店名稱包含"), { target: { value: "全" } });
    fireEvent.click(screen.getByRole("button", { name: "新增規則" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("至少要 2 個字");

    fireEvent.change(screen.getByLabelText("商店名稱包含"), { target: { value: "全聯" } });
    fireEvent.click(screen.getByRole("button", { name: "新增規則" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("請選擇要記到哪個分類");

    expect(db.calls).toHaveLength(0);
  });

  it("can disable and delete a rule, and reports a failed write", async () => {
    render(createElement(AutoRulesClient));
    await screen.findByLabelText("規則 全家");

    fireEvent.click(screen.getByRole("button", { name: "停用規則 全家" }));
    expect(await screen.findByText("已停用「全家」，之後會回到待確認。")).toBeInTheDocument();
    expect(db.calls.at(-1)).toEqual({ table: "ctbc_auto_rules", op: "update", payload: { enabled: false } });

    db.failWrites = true;
    fireEvent.click(screen.getByRole("button", { name: "刪除規則 全家" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("沒有成功");
  });
});
