import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelectLimit, mockInsertValues, mockOnConflictDoUpdate, mockGetPlanForTier } = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
  mockInsertValues: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
  mockGetPlanForTier: vi.fn(),
}));

vi.mock("../../database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelectLimit,
        }),
      }),
    }),
    insert: () => ({
      values: (values: unknown) => {
        mockInsertValues(values);
        return { onConflictDoUpdate: mockOnConflictDoUpdate };
      },
    }),
  },
}));

vi.mock("./plans", () => ({
  getPlanForTier: mockGetPlanForTier,
}));

import { checkQuota, getCurrentPeriodSpendCents, recordAiRequest, recordUsage } from "./usage";

describe("usage service", () => {
  beforeEach(() => {
    mockSelectLimit.mockReset();
    mockInsertValues.mockReset();
    mockOnConflictDoUpdate.mockReset().mockResolvedValue(undefined);
    mockGetPlanForTier.mockReset();
  });

  describe("getCurrentPeriodSpendCents", () => {
    it("returns 0 when there's no usage row yet this period", async () => {
      mockSelectLimit.mockResolvedValue([]);
      expect(await getCurrentPeriodSpendCents("user-1")).toBe(0);
    });

    it("returns the current period's running cost", async () => {
      mockSelectLimit.mockResolvedValue([{ costCents: 500 }]);
      expect(await getCurrentPeriodSpendCents("user-1")).toBe(500);
    });
  });

  describe("checkQuota", () => {
    it("blocks a tier with no plan row (e.g. free)", async () => {
      mockGetPlanForTier.mockResolvedValue(null);
      const result = await checkQuota("user-1", "free");
      expect(result.ok).toBe(false);
    });

    it("allows a request under budget", async () => {
      mockGetPlanForTier.mockResolvedValue({ monthlyBudgetCents: 2000 });
      mockSelectLimit.mockResolvedValue([{ costCents: 500 }]);
      const result = await checkQuota("user-1", "pro");
      expect(result.ok).toBe(true);
    });

    it("blocks a request at or over budget", async () => {
      mockGetPlanForTier.mockResolvedValue({ monthlyBudgetCents: 2000 });
      mockSelectLimit.mockResolvedValue([{ costCents: 2000 }]);
      const result = await checkQuota("user-1", "pro");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.budgetCents).toBe(2000);
        expect(result.spentCents).toBe(2000);
      }
    });
  });

  describe("recordUsage", () => {
    it("upserts the period's running cost", async () => {
      await recordUsage("user-1", 42);
      expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", costCents: 42 }));
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();
    });
  });

  describe("recordAiRequest", () => {
    it("inserts a request detail row", async () => {
      await recordAiRequest({ userId: "user-1", purpose: "chat", model: "claude-3-5-sonnet-20241022" });
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", purpose: "chat", model: "claude-3-5-sonnet-20241022" })
      );
    });

    it("defaults optional fields to null", async () => {
      await recordAiRequest({ userId: "user-1", purpose: "doc_indexing", model: "gpt-4o" });
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: null, prompt: null, response: null, errorCode: null })
      );
    });
  });
});
