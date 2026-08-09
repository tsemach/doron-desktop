import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthorizeOrgSession, mockCreateInvitation } = vi.hoisted(() => ({
  mockAuthorizeOrgSession: vi.fn(),
  mockCreateInvitation: vi.fn(),
}));

vi.mock("../../../../../lib/org/auth", () => ({
  authorizeOrgSession: mockAuthorizeOrgSession,
}));

vi.mock("../../../../../lib/org/invitations", () => ({
  createInvitation: mockCreateInvitation,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/org/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const admin = { id: "admin-1", role: "admin" as const, firmId: "firm-1" };

describe("POST /api/v1/org/invitations", () => {
  beforeEach(() => {
    mockAuthorizeOrgSession.mockReset();
    mockCreateInvitation.mockReset();
  });

  it("rejects when not signed in", async () => {
    mockAuthorizeOrgSession.mockResolvedValue({ error: "Unauthorized", status: 401 });

    const res = await POST(makeRequest({ email: "new@example.com", role: "user" }));

    expect(res.status).toBe(401);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    mockAuthorizeOrgSession.mockResolvedValue({ actor: admin });

    const res = await POST(makeRequest({ email: "not-an-email", role: "user" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/valid email/i);
  });

  it("rejects role=admin -- never invitable through this route", async () => {
    mockAuthorizeOrgSession.mockResolvedValue({ actor: admin });

    const res = await POST(makeRequest({ email: "new@example.com", role: "admin" }));

    expect(res.status).toBe(400);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized role", async () => {
    mockAuthorizeOrgSession.mockResolvedValue({ actor: admin });

    const res = await POST(makeRequest({ email: "new@example.com", role: "superuser" }));

    expect(res.status).toBe(400);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it("propagates a permission error from createInvitation (e.g. manager inviting a manager)", async () => {
    mockAuthorizeOrgSession.mockResolvedValue({ actor: admin });
    mockCreateInvitation.mockResolvedValue({ error: "You don't have permission to invite this role.", status: 403 });

    const res = await POST(makeRequest({ email: "new@example.com", role: "manager" }));

    expect(res.status).toBe(403);
  });

  it("creates the invitation on success", async () => {
    mockAuthorizeOrgSession.mockResolvedValue({ actor: admin });
    mockCreateInvitation.mockResolvedValue({ invitation: { id: "inv-1", token: "tok" } });

    const res = await POST(makeRequest({ email: "new@example.com", role: "user", teamId: "team-1" }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ success: true, invitationId: "inv-1" });
    expect(mockCreateInvitation).toHaveBeenCalledWith(
      admin,
      { email: "new@example.com", role: "user", teamId: "team-1" },
      "http://localhost:3000"
    );
  });
});
