import { describe, expect, it } from "vitest";
import { resolveGatewayModel, resolveTranscriptionModel } from "./models";

describe("resolveGatewayModel", () => {
  it("resolves a known provider/model to a namespaced gateway id", () => {
    expect(resolveGatewayModel("gemini", "gemini-3.5-flash")).toBe("google/gemini-3.5-flash");
  });

  it("returns null for an unrecognized provider", () => {
    expect(resolveGatewayModel("does-not-exist", "gpt-4o")).toBeNull();
  });

  it("returns null for a model not in the provider's known set", () => {
    expect(resolveGatewayModel("openai", "does-not-exist")).toBeNull();
  });
});

describe("resolveTranscriptionModel", () => {
  it("ignores the passed model for OpenAI and always returns the Whisper id", () => {
    expect(resolveTranscriptionModel("openai", "gpt-4o-mini")).toBe("openai/whisper-1");
    expect(resolveTranscriptionModel("openai", "anything-at-all")).toBe("openai/whisper-1");
  });

  it("resolves Gemini via the existing gateway model allowlist", () => {
    expect(resolveTranscriptionModel("gemini", "gemini-3.5-flash")).toBe("google/gemini-3.5-flash");
    expect(resolveTranscriptionModel("gemini", "gemini-3.1-flash-lite")).toBe("google/gemini-3.1-flash-lite");
  });

  it("rejects a Gemini model not in the allowlist", () => {
    expect(resolveTranscriptionModel("gemini", "does-not-exist")).toBeNull();
  });

  it("rejects any other provider", () => {
    expect(resolveTranscriptionModel("claude", "claude-3-5-sonnet-20241022")).toBeNull();
  });
});
