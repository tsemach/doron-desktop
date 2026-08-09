import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLimit } = vi.hoisted(() => ({ mockLimit: vi.fn() }));

vi.mock("../database", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: mockLimit,
          }),
        }),
      }),
    }),
  },
}));

import { authorizeDesktopToken } from "./desktopAuth";

describe("authorizeDesktopToken", () => {
  beforeEach(() => {
    mockLimit.mockReset();
  });

  it("rejects when no session row matches the token", async () => {
    mockLimit.mockResolvedValue([]);

    const result = await authorizeDesktopToken("nonexistent-token");

    expect(result).toEqual({ error: "Session no longer valid", status: 401 });
  });

  it("rejects an expired session", async () => {
    mockLimit.mockResolvedValue([
      { userId: "u1", tier: "pro", role: "admin", firmId: "firm-1", expiresAt: new Date(Date.now() - 1000) },
    ]);

    const result = await authorizeDesktopToken("expired-token");

    expect(result).toEqual({ error: "Session no longer valid", status: 401 });
  });

  it("returns the identity for a valid, unexpired session", async () => {
    mockLimit.mockResolvedValue([
      { userId: "u1", tier: "free", role: "manager", firmId: "firm-1", expiresAt: new Date(Date.now() + 1000 * 60) },
    ]);

    const result = await authorizeDesktopToken("valid-token");

    expect(result).toEqual({
      identity: { userId: "u1", tier: "free", role: "manager", firmId: "firm-1" },
    });
  });
});
