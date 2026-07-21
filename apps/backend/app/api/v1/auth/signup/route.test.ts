import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelectLimit, mockInsertReturning, mockDeleteWhere, mockCreateEmailVerification } = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockCreateEmailVerification: vi.fn(),
}));

vi.mock("../../../../../database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelectLimit,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: mockInsertReturning,
      }),
    }),
    delete: () => ({
      where: mockDeleteWhere,
    }),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    genSaltSync: () => "salt",
    hashSync: () => "hashed-password",
  },
}));

vi.mock("../../../../../lib/emailVerification", () => ({
  createEmailVerification: mockCreateEmailVerification,
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/auth/signup", () => {
  beforeEach(() => {
    mockSelectLimit.mockReset();
    mockInsertReturning.mockReset();
    mockDeleteWhere.mockReset().mockResolvedValue(undefined);
    mockCreateEmailVerification.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a missing field", async () => {
    const res = await POST(makeRequest({ fullName: "Jane Doe", email: "jane@example.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/missing required fields/i);
  });

  it("rejects an invalid full name", async () => {
    const res = await POST(makeRequest({ fullName: "<script>", email: "jane@example.com", password: "password1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/full name/i);
  });

  it("rejects a malformed email", async () => {
    const res = await POST(makeRequest({ fullName: "Jane Doe", email: "blah.blah", password: "password1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/valid email/i);
  });

  it("rejects a too-short password", async () => {
    const res = await POST(makeRequest({ fullName: "Jane Doe", email: "jane@example.com", password: "ab1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/6 and 16/i);
  });

  it("rejects a too-long password", async () => {
    const res = await POST(
      makeRequest({ fullName: "Jane Doe", email: "jane@example.com", password: "a".repeat(17) })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/6 and 16/i);
  });

  it("rejects when the email is already registered", async () => {
    mockSelectLimit.mockResolvedValue([{ id: "1", email: "jane@example.com" }]);

    const res = await POST(makeRequest({ fullName: "Jane Doe", email: "jane@example.com", password: "password1" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/already exists/i);
    expect(mockInsertReturning).not.toHaveBeenCalled();
  });

  it("creates the user and triggers email verification on success", async () => {
    mockSelectLimit.mockResolvedValue([]);
    mockInsertReturning.mockResolvedValue([
      { id: "1", name: "Jane Doe", email: "jane@example.com", createdAt: new Date() },
    ]);

    const res = await POST(makeRequest({ fullName: "Jane Doe", email: "jane@example.com", password: "password1", platform: "desktop" }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockCreateEmailVerification).toHaveBeenCalledWith("jane@example.com", "http://localhost:3000", "desktop");
  });

  it("rolls back the created user when sending the verification email fails", async () => {
    mockSelectLimit.mockResolvedValue([]);
    mockInsertReturning.mockResolvedValue([
      { id: "1", name: "Jane Doe", email: "jane@example.com", createdAt: new Date() },
    ]);
    mockCreateEmailVerification.mockRejectedValue(new Error("Resend domain not verified"));

    const res = await POST(makeRequest({ fullName: "Jane Doe", email: "jane@example.com", password: "password1" }));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/verification email failed to send/i);
    expect(data.error).toMatch(/try registering again/i);
    // The user row must actually be deleted -- otherwise a retry would hit
    // "account already exists" with no way to recover except manual cleanup.
    expect(mockDeleteWhere).toHaveBeenCalled();
  });
});
