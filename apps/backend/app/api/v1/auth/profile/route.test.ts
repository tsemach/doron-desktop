import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockSelectLimit, mockUpdateWhere } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockUpdateWhere: vi.fn(),
}));

vi.mock("../../../../../auth", () => ({
  auth: mockAuth,
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
    update: () => ({
      set: () => ({
        where: mockUpdateWhere,
      }),
    }),
  },
}));

import { GET, PATCH } from "./route";

function makePatchRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/auth/profile", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockSelectLimit.mockReset();
  });

  it("rejects when not signed in", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("returns 404 when the user row is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockSelectLimit.mockResolvedValue([]);

    const res = await GET();

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/auth/profile", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockUpdateWhere.mockReset().mockResolvedValue(undefined);
  });

  it("rejects when not signed in", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ locale: "he", interfaceFont: "plex" }));

    expect(res.status).toBe(401);
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("rejects an invalid locale", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const res = await PATCH(makePatchRequest({ locale: "fr", interfaceFont: "plex" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/locale/i);
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("rejects an invalid interfaceFont", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const res = await PATCH(makePatchRequest({ locale: "he", interfaceFont: "comic-sans" }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/interfaceFont/i);
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("persists a valid locale + interfaceFont", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const res = await PATCH(makePatchRequest({ locale: "he", interfaceFont: "heebo" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ locale: "he", interfaceFont: "heebo" });
    expect(mockUpdateWhere).toHaveBeenCalled();
  });
});
