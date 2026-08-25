import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMiddlewareResponse } from "./middlewareLogic";

// The "/" -> /app redirect is gated on isFeatureEnabled("app"), which reads
// the hardcoded, developer-editable FEATURE_GATES table -- mocked here so
// these tests stay deterministic regardless of that table's current
// contents (e.g. a developer flipping it off locally to test the disabled
// state manually).
const gateState = vi.hoisted(() => ({ appEnabled: true }));

vi.mock("./lib/featureGating", () => ({
  isFeatureEnabled: (feature: string) => (feature === "app" ? gateState.appEnabled : true),
}));

function url(pathname: string) {
  return new URL(pathname, "http://localhost:3000");
}

describe("resolveMiddlewareResponse", () => {
  beforeEach(() => {
    gateState.appEnabled = true;
  });

  it('rewrites "/" to /home for a logged-out visitor, keeping the URL bar at "/"', () => {
    const res = resolveMiddlewareResponse(url("/"), false);
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/home");
  });

  it('redirects "/" to /app for a logged-in visitor when the app gate is enabled', () => {
    const res = resolveMiddlewareResponse(url("/"), true);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it('rewrites "/" to /home for a logged-in visitor when the app gate is disabled', () => {
    gateState.appEnabled = false;
    const res = resolveMiddlewareResponse(url("/"), true);
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/home");
  });

  it("redirects /app to /login when logged out", () => {
    const res = resolveMiddlewareResponse(url("/app"), false);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects a nested /app path to /login when logged out", () => {
    const res = resolveMiddlewareResponse(url("/app/cases"), false);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("lets a logged-in visitor through to /app", () => {
    const res = resolveMiddlewareResponse(url("/app"), true);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects /login to /app when already logged in", () => {
    const res = resolveMiddlewareResponse(url("/login"), true);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("lets a logged-out visitor through to /login", () => {
    const res = resolveMiddlewareResponse(url("/login"), false);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("still redirects /checkout to /login when logged out (existing behavior)", () => {
    const res = resolveMiddlewareResponse(url("/checkout"), false);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("still redirects /profile to /login when logged out (existing behavior)", () => {
    const res = resolveMiddlewareResponse(url("/profile"), false);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("lets a logged-out visitor through to public pages like /pricing", () => {
    const res = resolveMiddlewareResponse(url("/pricing"), false);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a logged-in visitor through to /home directly (the in-app logo target)", () => {
    const res = resolveMiddlewareResponse(url("/home"), true);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
