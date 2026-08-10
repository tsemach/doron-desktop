import { describe, expect, it } from "vitest";
import { resolveMiddlewareResponse } from "./middlewareLogic";

function url(pathname: string) {
  return new URL(pathname, "http://localhost:3000");
}

describe("resolveMiddlewareResponse", () => {
  it('rewrites "/" to /home for a logged-out visitor, keeping the URL bar at "/"', () => {
    const res = resolveMiddlewareResponse(url("/"), false);
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/home");
  });

  it('redirects "/" to /app for a logged-in visitor', () => {
    const res = resolveMiddlewareResponse(url("/"), true);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("redirects /app to /login when logged out", () => {
    const res = resolveMiddlewareResponse(url("/app"), false);
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
