import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyCredentials, mockCreateDesktopSession } = vi.hoisted(() => ({
  mockVerifyCredentials: vi.fn(),
  mockCreateDesktopSession: vi.fn(),
}));

vi.mock("../../../../../lib/verifyCredentials", () => ({
  verifyCredentials: mockVerifyCredentials,
}));

vi.mock("../../../../../lib/desktopSession", () => ({
  createDesktopSession: mockCreateDesktopSession,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/auth/desktop-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/auth/desktop-login", () => {
  beforeEach(() => {
    mockVerifyCredentials.mockReset();
    mockCreateDesktopSession.mockReset();
  });

  it("rejects a missing email or password", async () => {
    const res = await POST(makeRequest({ email: "jane@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 with verifyCredentials' error when credentials are invalid", async () => {
    mockVerifyCredentials.mockResolvedValue({ error: "Invalid email or password, or your email hasn't been verified yet." });

    const res = await POST(makeRequest({ email: "jane@example.com", password: "wrong" }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/invalid email or password/i);
    expect(mockCreateDesktopSession).not.toHaveBeenCalled();
  });

  it("returns a desktop session token on success", async () => {
    mockVerifyCredentials.mockResolvedValue({
      user: { id: "1", email: "jane@example.com", tier: "free" },
    });
    mockCreateDesktopSession.mockResolvedValue({
      token: "abc123",
      expiresAt: new Date("2026-08-19T00:00:00.000Z"),
    });

    const res = await POST(makeRequest({ email: "jane@example.com", password: "correct" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      token: "abc123",
      email: "jane@example.com",
      tier: "free",
      expiresAt: "2026-08-19T00:00:00.000Z",
    });
    expect(mockCreateDesktopSession).toHaveBeenCalledWith("1");
  });
});
