import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLimit } = vi.hoisted(() => ({ mockLimit: vi.fn() }));

vi.mock("../database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockLimit,
        }),
      }),
    }),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compareSync: vi.fn(),
  },
}));

import bcrypt from "bcryptjs";
import { verifyCredentials } from "./verifyCredentials";

const GENERIC_ERROR = "Invalid email or password, or your email hasn't been verified yet.";

describe("verifyCredentials", () => {
  beforeEach(() => {
    mockLimit.mockReset();
    vi.mocked(bcrypt.compareSync).mockReset();
  });

  it("returns the generic error when no user exists for the email", async () => {
    mockLimit.mockResolvedValue([]);

    const result = await verifyCredentials("nobody@example.com", "password123");

    expect(result).toEqual({ error: GENERIC_ERROR });
  });

  it("returns the generic error when the user has no passwordHash (OAuth-only account)", async () => {
    mockLimit.mockResolvedValue([{ id: "1", email: "jane@example.com", passwordHash: null, emailVerified: new Date() }]);

    const result = await verifyCredentials("jane@example.com", "password123");

    expect(result).toEqual({ error: GENERIC_ERROR });
  });

  it("returns the generic error when the password doesn't match", async () => {
    mockLimit.mockResolvedValue([{ id: "1", email: "jane@example.com", passwordHash: "hash", emailVerified: new Date() }]);
    vi.mocked(bcrypt.compareSync).mockReturnValue(false);

    const result = await verifyCredentials("jane@example.com", "wrong-password");

    expect(result).toEqual({ error: GENERIC_ERROR });
  });

  it("returns the generic error (not a distinct message) when the password is correct but the email isn't verified", async () => {
    mockLimit.mockResolvedValue([{ id: "1", email: "jane@example.com", passwordHash: "hash", emailVerified: null }]);
    vi.mocked(bcrypt.compareSync).mockReturnValue(true);

    const result = await verifyCredentials("jane@example.com", "correct-password");

    expect(result).toEqual({ error: GENERIC_ERROR });
  });

  it("returns the user when the password matches and the email is verified", async () => {
    const user = { id: "1", email: "jane@example.com", passwordHash: "hash", emailVerified: new Date() };
    mockLimit.mockResolvedValue([user]);
    vi.mocked(bcrypt.compareSync).mockReturnValue(true);

    const result = await verifyCredentials("jane@example.com", "correct-password");

    expect(result).toEqual({ user });
  });
});
