// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryPickerModal } from "@/components/CategoryPickerModal";
import type { CategoryOption } from "@/lib/types";

const CATEGORIES: CategoryOption[] = [
  {
    id: "cat-food",
    groupId: "g-personal",
    groupName: "個人",
    name: "飲食",
    isQuick: true,
    isAuto: false,
    autoAmount: 0,
    sortOrder: 10,
  },
  {
    id: "cat-coffee",
    groupId: "g-personal",
    groupName: "個人",
    name: "咖啡",
    isQuick: false,
    isAuto: false,
    autoAmount: 0,
    sortOrder: 20,
  },
  {
    id: "cat-rent",
    groupId: "g-home",
    groupName: "家庭",
    name: "房租",
    isQuick: false,
    isAuto: true,
    autoAmount: 12000,
    sortOrder: 30,
  },
];

describe("CategoryPickerModal", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <CategoryPickerModal
        open={false}
        allCategories={CATEGORIES}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders categories grouped by groupName", () => {
    render(
      <CategoryPickerModal
        open
        allCategories={CATEGORIES}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "個人 飲食" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "個人 咖啡" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "家庭 房租" })).toBeInTheDocument();
  });

  it("filters by group + category name", () => {
    render(
      <CategoryPickerModal
        open
        allCategories={CATEGORIES}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("搜尋分類"), { target: { value: "飲" } });
    expect(screen.getByRole("button", { name: "個人 飲食" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "家庭 房租" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("搜尋分類"), { target: { value: "家庭" } });
    expect(screen.getByRole("button", { name: "家庭 房租" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "個人 飲食" })).not.toBeInTheDocument();
  });

  it("calls onSelect and onClose when a category is chosen", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CategoryPickerModal
        open
        allCategories={CATEGORIES}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "家庭 房租" }));
    expect(onSelect).toHaveBeenCalledWith("cat-rent");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when filter matches nothing", () => {
    render(
      <CategoryPickerModal
        open
        allCategories={CATEGORIES}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("搜尋分類"), { target: { value: "zzzzz" } });
    expect(screen.getByText("找不到符合搜尋條件的分類")).toBeInTheDocument();
  });

  it("disables selection when disabled prop is true", () => {
    render(
      <CategoryPickerModal
        open
        allCategories={CATEGORIES}
        disabled
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "個人 飲食" })).toBeDisabled();
  });
});
