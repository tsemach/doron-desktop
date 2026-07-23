import { APICallError, streamText } from "ai";
import { eq } from "drizzle-orm";
import { db } from "../../../../../database";
import { desktopSessions, users } from "../../../../../database/schema";
import { resolveGatewayModel } from "../../../../../lib/ai/models";
import { computeCostCents } from "../../../../../lib/ai/pricing";
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
}

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

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as CompleteRequestBody | null;
  if (!body) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, prompt, system, provider, model, structured } = body;

  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }
  if (!prompt || !provider || !model) {
    return Response.json({ error: "Missing prompt, provider, or model" }, { status: 400 });
  }

  // Same lookup as desktop-session/route.ts (token in the JSON body, not a
  // Bearer header -- no such convention exists anywhere in this codebase),
  // plus the user id this route needs for quota checks/usage recording
  // that desktop-session/route.ts doesn't select.
  const [session] = await db
    .select({ userId: users.id, tier: users.tier, expiresAt: desktopSessions.expiresAt })
    .from(desktopSessions)
    .innerJoin(users, eq(users.id, desktopSessions.userId))
    .where(eq(desktopSessions.token, token))
    .limit(1);

  if (!session || session.expiresAt.getTime() < Date.now()) {
    return Response.json({ error: "Session no longer valid" }, { status: 401 });
  }

  // Server-side enforcement -- never trust the desktop's own is_pro_tier
  // gate alone; free tier must not be able to reach the Gateway at all.
  if (session.tier !== "pro") {
    return Response.json({ error: "Cloud AI is a Pro feature." }, { status: 403 });
  }

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
    return singleLineNdjsonResponse({
      type: "error",
      code: "quota_exceeded",
      message: "You've used your monthly AI allowance for this billing period.",
      retryable: false,
      partial: false,
    });
  }

  const effectiveSystem = structured
    ? system
      ? `${system}\n\n${STRUCTURED_INSTRUCTION}`
      : STRUCTURED_INSTRUCTION
    : system;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let deltaSent = false;
      let responseText = "";
      const enqueue = (obj: unknown) => controller.enqueue(ndjsonLine(obj));

      try {
        const result = streamText({ model: gatewayModel, prompt, system: effectiveSystem });

        for await (const part of result.stream) {
          if (part.type === "text-delta") {
            deltaSent = true;
            responseText += part.text;
            enqueue({ type: "delta", text: part.text });
          } else if (part.type === "finish") {
            const inputTokens = part.totalUsage.inputTokens ?? 0;
            const outputTokens = part.totalUsage.outputTokens ?? 0;
            const costCents = computeCostCents(gatewayModel, inputTokens, outputTokens);

            await recordUsage(session.userId, costCents);
            await recordAiRequest({
              userId: session.userId,
              purpose: "chat",
              model: gatewayModel,
              prompt,
              response: responseText,
              inputTokens,
              outputTokens,
              costCents,
              finishReason: part.finishReason,
            });

            enqueue({
              type: "done",
              finishReason: part.finishReason,
              usage: { inputTokens, outputTokens },
            });
          } else if (part.type === "error") {
            await handleStreamError(part.error, session.userId, gatewayModel, prompt, deltaSent, enqueue);
            break; // nothing more will usefully follow an error part
          }
        }
      } catch (err) {
        // Errors that abort the stream outright (network failures before
        // any part arrives) rather than surfacing as an in-band 'error'
        // part -- result.stream's own docs: "Only errors that stop the
        // stream, such as network errors, are thrown."
        await handleStreamError(err, session.userId, gatewayModel, prompt, deltaSent, enqueue);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

async function handleStreamError(
  error: unknown,
  userId: string,
  gatewayModel: string,
  prompt: string,
  partial: boolean,
  enqueue: (obj: unknown) => void
): Promise<void> {
  const isApiError = APICallError.isInstance(error);
  const statusCode = isApiError ? error.statusCode : undefined;
  const code = statusCode === 429 ? "rate_limited" : "provider_error";
  // Default to retryable when the error shape is unrecognized -- a
  // transient/unknown failure should offer retry, not silently assume
  // it's permanent.
  const retryable = isApiError ? error.isRetryable : true;
  const retryAfterHeader = isApiError ? error.responseHeaders?.["retry-after"] : undefined;
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined;
  const message = isApiError ? error.message : "The AI provider request failed.";

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
    purpose: "chat",
    model: gatewayModel,
    prompt,
    errorCode: code,
  });
}
