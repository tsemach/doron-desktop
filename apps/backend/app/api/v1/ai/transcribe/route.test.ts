import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4, MockTranscriptionModelV4 } from "ai/test";

const { mockSelectLimit, mockCheckQuota, mockRecordUsage, mockRecordAiRequest } = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockRecordAiRequest: vi.fn(),
}));

// Set by each test before calling POST -- transcribe()/generateText()'s real
// implementation runs, only the underlying model is swapped for a mock, so
// the test exercises the actual dispatch/cost/response logic against real
// SDK result shapes rather than a hand-rolled fake.
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
    transcribe: (options: any) => actual.transcribe({ ...options, model: currentMockModel }),
    generateText: (options: any) => actual.generateText({ ...options, model: currentMockModel }),
  };
});

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/ai/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  token: "tok_abc",
  audioBase64: Buffer.from("fake-audio-bytes").toString("base64"),
  mimeType: "audio/wav",
  provider: "openai",
  model: "gpt-4o-mini", // deliberately not whisper-1 -- should be ignored for OpenAI
};

const activeSession = { userId: "u1", tier: "pro", expiresAt: new Date(Date.now() + 100_000) };

describe("POST /api/v1/ai/transcribe", () => {
  beforeEach(() => {
    mockSelectLimit.mockReset();
    mockCheckQuota.mockReset().mockResolvedValue({ ok: true });
    mockRecordUsage.mockReset().mockResolvedValue(undefined);
    mockRecordAiRequest.mockReset().mockResolvedValue(undefined);
    currentMockModel = undefined;
  });

  it("rejects a missing token", async () => {
    const res = await POST(makeRequest({ audioBase64: "abc", mimeType: "audio/wav", provider: "openai", model: "whisper-1" }));
    expect(res.status).toBe(400);
  });

  it("rejects a missing audioBase64/mimeType/provider/model", async () => {
    const res = await POST(makeRequest({ token: "tok_abc" }));
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

  it("rejects an unrecognized provider", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);
    const res = await POST(makeRequest({ ...VALID_BODY, provider: "claude" }));
    expect(res.status).toBe(400);
  });

  it("blocks with quota_exceeded and never calls the model", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);
    mockCheckQuota.mockResolvedValue({ ok: false, budgetCents: 2000, spentCents: 2000 });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "quota_exceeded" }) }));
    expect(mockRecordAiRequest).not.toHaveBeenCalled();
  });

  it("transcribes via OpenAI/Whisper and records duration-based usage", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);

    currentMockModel = new MockTranscriptionModelV4({
      doGenerate: async () => ({
        text: "hello from whisper",
        segments: [],
        language: "en",
        durationInSeconds: 30,
        warnings: [],
        response: { timestamp: new Date(), modelId: "whisper-1" },
      }),
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ text: "hello from whisper" });

    // 30s = 0.5 min * 0.6 cents/min = 0.3, rounded up to 1
    expect(mockRecordUsage).toHaveBeenCalledWith("u1", 1);
    expect(mockRecordAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        purpose: "voice_transcription",
        model: "openai/whisper-1",
        response: "hello from whisper",
        costCents: 1,
      })
    );
  });

  it("transcribes via Gemini generateText and records token-based usage", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);

    currentMockModel = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: "hello from gemini" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      }),
    });

    const res = await POST(makeRequest({ ...VALID_BODY, provider: "gemini", model: "gemini-3.5-flash" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ text: "hello from gemini" });

    expect(mockRecordUsage).toHaveBeenCalledWith("u1", expect.any(Number));
    expect(mockRecordAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        purpose: "voice_transcription",
        model: "google/gemini-3.5-flash",
        response: "hello from gemini",
        inputTokens: 100,
        outputTokens: 20,
      })
    );
  });

  it("threads a custom purpose through, defaulting to voice_transcription when omitted", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);

    currentMockModel = new MockTranscriptionModelV4({
      doGenerate: async () => ({
        text: "hi",
        segments: [],
        language: undefined,
        durationInSeconds: 1,
        warnings: [],
        response: { timestamp: new Date(), modelId: "whisper-1" },
      }),
    });

    await POST(makeRequest(VALID_BODY));
    expect(mockRecordAiRequest).toHaveBeenCalledWith(expect.objectContaining({ purpose: "voice_transcription" }));
  });

  it("maps a provider failure to provider_error and records it", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);

    currentMockModel = new MockTranscriptionModelV4({
      doGenerate: async () => {
        throw Object.assign(new Error("boom"), { statusCode: 500, isRetryable: false });
      },
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: "provider_error", retryable: false }) })
    );
    expect(mockRecordAiRequest).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "provider_error" }));
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });

  it("maps a 429 provider failure to rate_limited", async () => {
    mockSelectLimit.mockResolvedValue([activeSession]);

    currentMockModel = new MockTranscriptionModelV4({
      doGenerate: async () => {
        throw Object.assign(new Error("rate limited"), { statusCode: 429 });
      },
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: "rate_limited" }) }));
    expect(mockRecordAiRequest).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "rate_limited" }));
  });
});
