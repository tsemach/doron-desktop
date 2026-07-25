import { describe, expect, it } from "vitest";
import { computeCostCents, computeTranscriptionCostCents } from "./pricing";

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

describe("computeTranscriptionCostCents", () => {
  it("computes OpenAI cost from audio duration, ignoring token args", () => {
    const cost = computeTranscriptionCostCents("openai", "openai/whisper-1", 60, 999_999, 999_999);
    expect(cost).toBe(1); // 1 minute * 0.6 cents/min, rounded up
  });

  it("rounds OpenAI duration cost up rather than down", () => {
    const cost = computeTranscriptionCostCents("openai", "openai/whisper-1", 1);
    expect(cost).toBe(1);
  });

  it("delegates Gemini cost to the token-based computeCostCents", () => {
    const cost = computeTranscriptionCostCents("gemini", "google/gemini-3.5-flash", 9999, 1_000_000, 1_000_000);
    expect(cost).toBe(computeCostCents("google/gemini-3.5-flash", 1_000_000, 1_000_000));
  });

  it("treats missing Gemini token counts as zero", () => {
    const cost = computeTranscriptionCostCents("gemini", "google/gemini-3.5-flash", 9999);
    expect(cost).toBe(0);
  });

  it("throws for an unsupported provider", () => {
    expect(() => computeTranscriptionCostCents("claude", "anthropic/claude-3-5-sonnet-20241022", 10)).toThrow(
      /no transcription pricing/i
    );
  });
});
