import { generateText, transcribe } from "ai";
import { authorizeRequest, type AuthorizedSession } from "../../../../../lib/ai/auth";
import { resolveTranscriptionModel } from "../../../../../lib/ai/models";
import { computeTranscriptionCostCents } from "../../../../../lib/ai/pricing";
import { mapProviderError } from "../../../../../lib/ai/providerError";
import { resolvePurpose, type Purpose } from "../../../../../lib/ai/purpose";
import { checkQuota, recordAiRequest, recordUsage } from "../../../../../lib/ai/usage";

interface TranscribeRequestBody {
  token?: string;
  audioBase64?: string;
  mimeType?: string;
  provider?: string;
  model?: string;
  language?: string;
  purpose?: string;
}

interface ValidatedRequest {
  token: string;
  audioBase64: string;
  mimeType: string;
  provider: string;
  model: string;
  language?: string;
  purpose: Purpose;
}

type RequestValidationResult = { value: ValidatedRequest } | { error: string };

export async function POST(request: Request): Promise<Response> {
  const rawBody = (await request.json().catch(() => null)) as TranscribeRequestBody | null;

  const validation = validateRequestBody(rawBody);
  if ("error" in validation) {
    return Response.json({ error: validation.error }, { status: 400 });
  }
  const { token, audioBase64, mimeType, provider, model, language, purpose } = validation.value;

  const authorization = await authorizeRequest(token);
  if ("error" in authorization) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }
  const { session } = authorization;

  const resolvedModel = resolveTranscriptionModel(provider, model);
  if (!resolvedModel) {
    return Response.json({ error: `Unrecognized provider/model: ${provider}/${model}` }, { status: 400 });
  }

  // Hard block, same as /complete -- never call the provider once quota is
  // exceeded. Unlike /complete, no ai_requests row is recorded here either
  // (mirrors /complete's own quota-exceeded path, which also skips
  // recordAiRequest) -- a blocked attempt costs nothing and leaves nothing
  // to log.
  const quota = await checkQuota(session.userId, session.tier);
  if (!quota.ok) {
    return Response.json(
      {
        error: {
          code: "quota_exceeded",
          message: "You've used your monthly AI allowance for this billing period.",
          retryable: false,
        },
      },
      { status: 429 }
    );
  }

  try {
    const audio = Buffer.from(audioBase64, "base64");

    if (provider.toLowerCase() === "openai") {
      const result = await transcribe({ model: resolvedModel, audio });
      return await recordSuccessAndRespond({
        session,
        provider,
        resolvedModel,
        purpose,
        text: result.text,
        durationSeconds: result.durationInSeconds ?? 0,
      });
    }

    // Gemini transcription is a plain multimodal generateText call, not a
    // dedicated transcription model -- see resolveTranscriptionModel's
    // comment and docs/ai-online-proxy/voice_transcription_architecture.md
    // §3.4. Instruction text mirrors llm_provider_gemini.rs::transcribe()
    // exactly, so switching between BYOM/direct and online mode produces
    // the same transcript behavior.
    const result = await generateText({
      model: resolvedModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "file", data: audio, mediaType: mimeType },
            { type: "text", text: transcriptionInstruction(language) },
          ],
        },
      ],
    });
    return await recordSuccessAndRespond({
      session,
      provider,
      resolvedModel,
      purpose,
      text: result.text,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    });
  } catch (err) {
    return await handleTranscriptionError(err, session.userId, resolvedModel, purpose);
  }
}

// ── Request validation ──────────────────────────────────────────────────

function validateRequestBody(body: TranscribeRequestBody | null): RequestValidationResult {
  if (!body) return { error: "Invalid request body" };
  const { token, audioBase64, mimeType, provider, model, language, purpose } = body;

  if (!token) return { error: "Missing token" };
  if (!audioBase64 || !mimeType || !provider || !model) {
    return { error: "Missing audioBase64, mimeType, provider, or model" };
  }

  return {
    value: { token, audioBase64, mimeType, provider, model, language, purpose: resolvePurpose(purpose, "voice_transcription") },
  };
}

function transcriptionInstruction(language: string | undefined): string {
  if (language && language !== "auto") {
    return `Transcribe this audio exactly as spoken, in ${language}. Return only the transcript text, no commentary, no formatting.`;
  }
  return "Transcribe this audio exactly as spoken. Return only the transcript text, no commentary, no formatting.";
}

// ── Success / error recording ───────────────────────────────────────────

interface SuccessInput {
  session: AuthorizedSession;
  provider: string;
  resolvedModel: string;
  purpose: Purpose;
  text: string;
  durationSeconds?: number;
  inputTokens?: number;
  outputTokens?: number;
}

async function recordSuccessAndRespond(input: SuccessInput): Promise<Response> {
  const costCents = computeTranscriptionCostCents(
    input.provider,
    input.resolvedModel,
    input.durationSeconds ?? 0,
    input.inputTokens,
    input.outputTokens
  );

  await recordUsage(input.session.userId, costCents);
  await recordAiRequest({
    userId: input.session.userId,
    purpose: input.purpose,
    model: input.resolvedModel,
    response: input.text,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    costCents,
  });

  return Response.json({ text: input.text });
}

async function handleTranscriptionError(
  error: unknown,
  userId: string,
  resolvedModel: string,
  purpose: Purpose
): Promise<Response> {
  console.error("AI transcription error:", error);

  const { code, message, retryable, retryAfterSeconds } = mapProviderError(error);

  await recordAiRequest({
    userId,
    purpose,
    model: resolvedModel,
    errorCode: code,
  });

  const status = code === "rate_limited" ? 429 : 502;
  return Response.json(
    { error: { code, message, retryable, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) } },
    { status }
  );
}
