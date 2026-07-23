import { describe, expect, it } from "vitest";
import { computeCostCents } from "./pricing";

describe("computeCostCents", () => {
  it("computes cost from input and output tokens at 1M-token scale", () => {
    const cost = computeCostCents("anthropic/claude-3-5-sonnet-20241022", 1_000_000, 1_000_000);
    expect(cost).toBe(300 + 1500);
  });

  it("rounds up rather than down", () => {
    const cost = computeCostCents("anthropic/claude-3-5-sonnet-20241022", 1, 0);
    expect(cost).toBe(1);
  });

  it("returns 0 for a free/preview model", () => {
    const cost = computeCostCents("google/gemini-2.0-flash-exp", 1_000_000, 1_000_000);
    expect(cost).toBe(0);
  });

  it("throws for a model with no configured pricing", () => {
    expect(() => computeCostCents("anthropic/does-not-exist", 100, 100)).toThrow(/no pricing/i);
  });
});
