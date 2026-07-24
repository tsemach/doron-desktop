import { streamText } from "ai";
import { authorizeRequest, type AuthorizedSession } from "../../../../../lib/ai/auth";
import { resolveGatewayModel } from "../../../../../lib/ai/models";
import { computeCostCents } from "../../../../../lib/ai/pricing";
import { mapProviderError } from "../../../../../lib/ai/providerError";
import { resolvePurpose, type Purpose } from "../../../../../lib/ai/purpose";
import { checkQuota, recordAiRequest, recordUsage } from "../../../../../lib/ai/usage";

// Mirrors ClaudeProvider::call_structured's system-prompt instruction in
// llm_provider_entropic.rs, so switching between BYOM/local (still
// Rust-side) and online (now backend-proxied) mode produces the same
// structured-output behavior.
const STRUCTURED_INSTRUCTION =
  "IMPORTANT: Your response must be ONLY valid JSON. Do not include markdown code fences or explanatory text. Start directly with { and end with }.";

interface CompleteRequestBody {
  token?: string;
  prompt?: string;
  system?: string;
  provider?: string;
  model?: string;
  structured?: boolean;
  purpose?: string;
}

interface ValidatedRequest {
  token: string;
  prompt: string;
  system?: string;
  provider: string;
  model: string;
  structured?: boolean;
  purpose: Purpose;
}

type RequestValidationResult = { value: ValidatedRequest } | { error: string };

export async function POST(request: Request): Promise<Response> {
  const rawBody = (await request.json().catch(() => null)) as CompleteRequestBody | null;

  const validation = validateRequestBody(rawBody);
  if ("error" in validation) {
    return Response.json({ error: validation.error }, { status: 400 });
  }
  const { token, prompt, system, provider, model, structured, purpose } = validation.value;

  const authorization = await authorizeRequest(token);
  if ("error" in authorization) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }
  const { session } = authorization;

  const gatewayModel = resolveGatewayModel(provider, model);
  if (!gatewayModel) {
    return Response.json({ error: `Unrecognized provider/model: ${provider}/${model}` }, { status: 400 });
  }

  const quota = await checkQuota(session.userId, session.tier);
  if (!quota.ok) {
    // Hard block, per design doc §7 -- never call streamText() once quota
    // is exceeded. This one-line stream, not a plain 4xx, keeps the Rust
    // client's NDJSON parser as the single path for every outcome of an
    // attempted AI call (pre-flight auth/tier failures above are plain
    // JSON responses instead, since those never got as far as "an AI call
    // that was then blocked").
    return quotaExceededResponse();
  }

  const effectiveSystem = buildEffectiveSystem(system, structured);
  return streamCompletion(session, gatewayModel, prompt, effectiveSystem, purpose);
}

// ── Request validation ──────────────────────────────────────────────────

function validateRequestBody(body: CompleteRequestBody | null): RequestValidationResult {
  if (!body) return { error: "Invalid request body" };
  const { token, prompt, system, provider, model, structured, purpose } = body;

  if (!token) return { error: "Missing token" };
  if (!prompt || !provider || !model) return { error: "Missing prompt, provider, or model" };

  return { value: { token, prompt, system, provider, model, structured, purpose: resolvePurpose(purpose) } };
}

// ── NDJSON envelope helpers ──────────────────────────────────────────────

function ndjsonLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function singleLineNdjsonResponse(obj: unknown): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(ndjsonLine(obj));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

function quotaExceededResponse(): Response {
  return singleLineNdjsonResponse({
    type: "error",
    code: "quota_exceeded",
    message: "You've used your monthly AI allowance for this billing period.",
    retryable: false,
    partial: false,
  });
}

function buildEffectiveSystem(system: string | undefined, structured: boolean | undefined): string | undefined {
  if (!structured) return system;
  return system ? `${system}\n\n${STRUCTURED_INSTRUCTION}` : STRUCTURED_INSTRUCTION;
}

// ── Streaming ────────────────────────────────────────────────────────────

function streamCompletion(
  session: AuthorizedSession,
  gatewayModel: string,
  prompt: string,
  effectiveSystem: string | undefined,
  purpose: Purpose
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (obj: unknown) => controller.enqueue(ndjsonLine(obj));
      const state = { deltaSent: false };

      try {
        const result = streamText({ model: gatewayModel, prompt, system: effectiveSystem });
        await translateStreamToNdjson(result, state, session, gatewayModel, prompt, purpose, enqueue);
      } catch (err) {
        // Errors that abort the stream outright (network failures before
        // any part arrives) rather than surfacing as an in-band 'error'
        // part -- result.stream's own docs: "Only errors that stop the
        // stream, such as network errors, are thrown."
        await handleStreamError(err, session.userId, gatewayModel, prompt, purpose, state.deltaSent, enqueue);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

async function translateStreamToNdjson(
  result: ReturnType<typeof streamText>,
  state: { deltaSent: boolean },
  session: AuthorizedSession,
  gatewayModel: string,
  prompt: string,
  purpose: Purpose,
  enqueue: (obj: unknown) => void
): Promise<void> {
  let responseText = "";

  for await (const part of result.stream) {
    if (part.type === "text-delta") {
      state.deltaSent = true;
      responseText += part.text;
      enqueue({ type: "delta", text: part.text });
    } else if (part.type === "finish") {
      await recordFinish(part.finishReason, part.totalUsage, session, gatewayModel, prompt, purpose, responseText, enqueue);
    } else if (part.type === "error") {
      await handleStreamError(part.error, session.userId, gatewayModel, prompt, purpose, state.deltaSent, enqueue);
      break; // nothing more will usefully follow an error part
    }
  }
}

async function recordFinish(
  finishReason: string,
  totalUsage: { inputTokens: number | undefined; outputTokens: number | undefined },
  session: AuthorizedSession,
  gatewayModel: string,
  prompt: string,
  purpose: Purpose,
  responseText: string,
  enqueue: (obj: unknown) => void
): Promise<void> {
  const inputTokens = totalUsage.inputTokens ?? 0;
  const outputTokens = totalUsage.outputTokens ?? 0;
  const costCents = computeCostCents(gatewayModel, inputTokens, outputTokens);

  await recordUsage(session.userId, costCents);
  await recordAiRequest({
    userId: session.userId,
    purpose,
    model: gatewayModel,
    prompt,
    response: responseText,
    inputTokens,
    outputTokens,
    costCents,
    finishReason,
  });

  enqueue({ type: "done", finishReason, usage: { inputTokens, outputTokens } });
}

async function handleStreamError(
  error: unknown,
  userId: string,
  gatewayModel: string,
  prompt: string,
  purpose: Purpose,
  partial: boolean,
  enqueue: (obj: unknown) => void
): Promise<void> {
  console.error("AI completion stream error:", error);

  const { code, message, retryable, retryAfterSeconds } = mapProviderError(error);

  enqueue({
    type: "error",
    code,
    message,
    retryable,
    partial,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });

  // No usage/cost is recorded here: the AI SDK's error stream part carries
  // no usage figure of its own, and result.usage only reflects real numbers
  // once a 'finish'/'finish-step' chunk has actually arrived -- an error
  // that occurs before one ever does leaves nothing to bill (verified via
  // route.test.ts's mid-stream-error case, not assumed; see design doc §8
  // for the intent this falls short of -- "bill for tokens already
  // generated" isn't achievable with what this SDK version exposes on an
  // error part). The outcome is still logged for support/audit purposes.
  await recordAiRequest({
    userId,
    purpose,
    model: gatewayModel,
    prompt,
    errorCode: code,
  });
}
