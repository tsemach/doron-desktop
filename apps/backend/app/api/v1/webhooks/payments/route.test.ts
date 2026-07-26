import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdateSet, mockVerifyAndParseWebhook, mockResetCurrentPeriodUsage } = vi.hoisted(() => ({
  mockUpdateSet: vi.fn(),
  mockVerifyAndParseWebhook: vi.fn(),
  mockResetCurrentPeriodUsage: vi.fn(),
}));

vi.mock("../../../../../database", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        mockUpdateSet(values);
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    }),
  },
}));

vi.mock("../../../../../lib/payments/mock-provider", () => ({
  getPaymentProvider: () => ({ verifyAndParseWebhook: mockVerifyAndParseWebhook }),
}));

vi.mock("../../../../../lib/ai/usage", () => ({
  resetCurrentPeriodUsage: mockResetCurrentPeriodUsage,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/webhooks/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/webhooks/payments", () => {
  beforeEach(() => {
    mockUpdateSet.mockReset();
    mockVerifyAndParseWebhook.mockReset();
    mockResetCurrentPeriodUsage.mockReset().mockResolvedValue(undefined);
  });

  it("rejects an invalid webhook payload", async () => {
    mockVerifyAndParseWebhook.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mockResetCurrentPeriodUsage).not.toHaveBeenCalled();
  });

  it("grants a fresh AI quota when a Pro payment is confirmed", async () => {
    mockVerifyAndParseWebhook.mockResolvedValue({ userId: "user-1", tier: "pro" });
    const res = await POST(makeRequest({ userId: "user-1", tier: "pro" }));
    expect(res.status).toBe(200);
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ tier: "pro" }));
    expect(mockResetCurrentPeriodUsage).toHaveBeenCalledWith("user-1");
  });

  it("doesn't touch AI quota for a free-tier confirmation", async () => {
    mockVerifyAndParseWebhook.mockResolvedValue({ userId: "user-1", tier: "free" });
    const res = await POST(makeRequest({ userId: "user-1", tier: "free" }));
    expect(res.status).toBe(200);
    expect(mockResetCurrentPeriodUsage).not.toHaveBeenCalled();
  });
});
