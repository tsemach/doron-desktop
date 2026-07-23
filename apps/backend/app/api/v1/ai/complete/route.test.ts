import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";

const { mockSelectLimit, mockCheckQuota, mockRecordUsage, mockRecordAiRequest } = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockRecordAiRequest: vi.fn(),
}));

// Set by each test before calling POST -- streamText's real implementation
// runs, only the underlying model is swapped for a MockLanguageModelV4, so
// the test exercises the actual NDJSON-translation logic against real SDK
// stream/finish/error part shapes rather than a hand-rolled fake.
let currentMockModel: unknown;

vi.mock("../../../../../database", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: mockSelectLimit,
          }),
        }),
      }),
    }),
  },
}));

vi.mock("../../../../../lib/ai/usage", () => ({
  checkQuota: mockCheckQuota,
  recordUsage: mockRecordUsage,
  recordAiRequest: mockRecordAiRequest,
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: (options: any) => actual.streamText({ ...options, model: currentMockModel }),
  };
});

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/ai/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readAllLines(res: Response) {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const VALID_BODY = {
  token: "tok_abc",
  prompt: "hello",
  provider: "claude",
  model: "claude-3-5-sonnet-20241022",
};

const activeSession = { userId: "u1", tier: "pro", expiresAt: new Date(Date.now() + 100_000) };

describe("POST /api/v1/ai/complete", () => {
  beforeEach(() => {
    mockSelectLimit.mockReset();
    mockCheckQuota.mockReset().mockResolvedValue({ ok: true });
    mockRecordUsage.mockReset().mockResolvedValue(undefined);
    mockRecordAiRequest.mockReset().mockResolvedValue(undefined);
    currentMockModel = undefined;
  });

  it("rejects a missing token", async () => {
    const res = await POST(makeRequest({ prompt: "hi", provider: "claude", model: "claude-3-5-sonnet-20241022" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid or expired session", async () => {
    mockSelectLimit.mockResolvedValue([]);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("rejects a free-tier user", async () => {
    mockSelectLimit.mockResolvedValue([{ ...activeSession, tier: "free" }]);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("rejects an unrecognized provider/model", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);
    const res = await POST(makeRequest({ ...VALID_BODY, model: "not-a-real-model" }));
    expect(res.status).toBe(400);
  });

  it("blocks with a single quota_exceeded line and never calls the model", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);
    mockCheckQuota.mockResolvedValue({ ok: false, budgetCents: 2000, spentCents: 2000 });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const lines = await readAllLines(res);
    expect(lines).toEqual([
      expect.objectContaining({ type: "error", code: "quota_exceeded", retryable: false, partial: false }),
    ]);
    expect(mockRecordAiRequest).not.toHaveBeenCalled();
  });

  it("streams a normal completion and records usage", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);

    const { simulateReadableStream } = await import("ai");
    currentMockModel = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Hello" },
            { type: "text-delta", id: "t1", delta: ", world!" },
            { type: "text-end", id: "t1" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 5, text: 5, reasoning: undefined },
              },
            },
          ],
        }),
      }),
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const lines = await readAllLines(res);

    expect(lines[0]).toEqual({ type: "delta", text: "Hello" });
    expect(lines[1]).toEqual({ type: "delta", text: ", world!" });
    expect(lines[2]).toEqual(
      expect.objectContaining({ type: "done", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 5 } })
    );

    expect(mockRecordUsage).toHaveBeenCalledWith("u1", expect.any(Number));
    expect(mockRecordAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        model: "anthropic/claude-3-5-sonnet-20241022",
        response: "Hello, world!",
        inputTokens: 10,
        outputTokens: 5,
      })
    );
  });

  it("threads a valid purpose through to recordAiRequest", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);

    const { simulateReadableStream } = await import("ai");
    currentMockModel = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 1, text: 1, reasoning: undefined },
              },
            },
          ],
        }),
      }),
    });

    const res = await POST(makeRequest({ ...VALID_BODY, purpose: "doc_indexing" }));
    await readAllLines(res); // drains the stream -- streamCompletion's work runs in the background otherwise
    expect(mockRecordAiRequest).toHaveBeenCalledWith(expect.objectContaining({ purpose: "doc_indexing" }));
  });

  it("defaults an absent or unrecognized purpose to chat", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);

    const { simulateReadableStream } = await import("ai");
    currentMockModel = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 1, text: 1, reasoning: undefined },
              },
            },
          ],
        }),
      }),
    });

    const res = await POST(makeRequest({ ...VALID_BODY, purpose: "not_a_real_purpose" }));
    await readAllLines(res);
    expect(mockRecordAiRequest).toHaveBeenCalledWith(expect.objectContaining({ purpose: "chat" }));
  });

  it("terminates with a partial, retryable error on a mid-stream failure", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);

    const { simulateReadableStream } = await import("ai");
    currentMockModel = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Partial" },
            { type: "error", error: new Error("simulated provider failure") },
          ],
        }),
      }),
    });

    const res = await POST(makeRequest(VALID_BODY));
    const lines = await readAllLines(res);

    expect(lines[0]).toEqual({ type: "delta", text: "Partial" });
    expect(lines[1]).toEqual(
      expect.objectContaining({ type: "error", code: "provider_error", partial: true, retryable: true })
    );
    expect(mockRecordAiRequest).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", errorCode: "provider_error" }));
    // No usage figure is available on an in-band error part in this SDK
    // version -- confirms the route.ts comment's claim empirically rather
    // than assuming it.
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  it("never leaks the raw provider/Gateway error text to the client, but logs it server-side", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mirrors a live @ai-sdk/gateway GatewayInternalServerError: an
    // operational detail ("AI Gateway requires a valid credit card on
    // file...") that's Amicus's problem to fix, not something a paying
    // end user should see. Not recognized by APICallError.isInstance(),
    // but carries statusCode/isRetryable as real own properties, which is
    // duck-typed for the error code/retryable flag even though the raw
    // message itself is discarded from the client-facing response.
    const gatewayError = Object.assign(
      new Error("AI Gateway requires a valid credit card on file to service requests."),
      { name: "GatewayInternalServerError", statusCode: 403, isRetryable: false }
    );

    currentMockModel = new MockLanguageModelV4({
      doStream: async () => {
        throw gatewayError;
      },
    });

    const res = await POST(makeRequest(VALID_BODY));
    const lines = await readAllLines(res);

    expect(lines).toEqual([
      expect.objectContaining({
        type: "error",
        code: "provider_error",
        message: "The AI request failed. Please try again, or contact support if this keeps happening.",
        retryable: false,
        partial: false,
      }),
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("AI completion stream error"), gatewayError);

    consoleErrorSpy.mockRestore();
  });
});
