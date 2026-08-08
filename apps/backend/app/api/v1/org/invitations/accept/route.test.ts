import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAcceptInvitation } = vi.hoisted(() => ({
  mockAcceptInvitation: vi.fn(),
}));

vi.mock("../../../../../../lib/org/invitations", () => ({
  acceptInvitation: mockAcceptInvitation,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/org/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/org/invitations/accept", () => {
  beforeEach(() => {
    mockAcceptInvitation.mockReset();
  });

  it("rejects a missing field", async () => {
    const res = await POST(makeRequest({ token: "tok", fullName: "Jane Doe" }));
    expect(res.status).toBe(400);
    expect(mockAcceptInvitation).not.toHaveBeenCalled();
  });

  it("rejects a too-short password", async () => {
    const res = await POST(makeRequest({ token: "tok", fullName: "Jane Doe", password: "ab1" }));
    expect(res.status).toBe(400);
    expect(mockAcceptInvitation).not.toHaveBeenCalled();
  });

  it("rejects an expired invitation", async () => {
    mockAcceptInvitation.mockResolvedValue({ error: "This invitation has expired.", status: 400 });

    const res = await POST(makeRequest({ token: "tok", fullName: "Jane Doe", password: "password1" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/expired/i);
  });

  it("rejects an already-accepted invitation", async () => {
    mockAcceptInvitation.mockResolvedValue({ error: "This invitation has already been used.", status: 400 });

    const res = await POST(makeRequest({ token: "tok", fullName: "Jane Doe", password: "password1" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/already been used/i);
  });

  it("creates the user on a valid, unused invitation", async () => {
    mockAcceptInvitation.mockResolvedValue({ user: { id: "u1", email: "jane@example.com" } });

    const res = await POST(makeRequest({ token: "tok", fullName: "Jane Doe", password: "password1" }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ success: true, user: { id: "u1", email: "jane@example.com" } });
    expect(mockAcceptInvitation).toHaveBeenCalledWith("tok", { fullName: "Jane Doe", password: "password1" });
  });
});
