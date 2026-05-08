// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MoneyText } from "@/components/m3/MoneyText";

describe("MoneyText", () => {
  afterEach(() => cleanup());

  it("formats integer with thousand separator and adds $", () => {
    render(<MoneyText value={1280} />);
    expect(screen.getByText("$1,280")).toBeInTheDocument();
  });

  it("uses minus sign for expense by default", () => {
    render(<MoneyText value={120} type="expense" />);
    expect(screen.getByText("−$120")).toBeInTheDocument();
  });

  it("uses plus sign for income by default", () => {
    render(<MoneyText value={50000} type="income" />);
    expect(screen.getByText("+$50,000")).toBeInTheDocument();
  });

  it("respects prefix=false to suppress sign", () => {
    render(<MoneyText value={100} type="expense" prefix={false} />);
    expect(screen.getByText("$100")).toBeInTheDocument();
  });

  it("supports showCurrency=false to drop $", () => {
    render(<MoneyText value={1234} showCurrency={false} />);
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("applies size and type Tailwind classes", () => {
    render(<MoneyText value={1} type="warn" size="hero" />);
    const span = screen.getByText("$1");
    expect(span.className).toMatch(/text-num-hero/);
    expect(span.className).toMatch(/text-money-warn/);
  });

  it("formats negative input with abs value (sign comes from prefix)", () => {
    render(<MoneyText value={-300} type="expense" />);
    expect(screen.getByText("−$300")).toBeInTheDocument();
  });

  it("supports decimals", () => {
    render(<MoneyText value={12.5} decimals={2} showCurrency={false} />);
    expect(screen.getByText("12.50")).toBeInTheDocument();
  });
});
