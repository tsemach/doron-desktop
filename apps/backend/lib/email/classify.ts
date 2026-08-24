import { gateway, generateText } from "ai";
import { computeCostCents } from "../ai/pricing";
import { checkQuota, recordAiRequest, recordUsage } from "../ai/usage";

// Internal function, same reasoning as lib/ai/embed.ts -- this is never
// called by the desktop's token-authed AI routes, only from within
// whatever cookie-authenticated route eventually drives real ingestion
// (not built in this pass, see the schema comment in
// packages/backend-orm/src/schema.ts). Reuses an already-priced chat
// model (lib/ai/pricing.ts) rather than adding new pricing entries for a
// dedicated classification model.

const CLASSIFICATION_MODEL = "anthropic/claude-3-5-sonnet-20241022";

// Mirrors /complete's own structured-output instruction exactly (same
// text, same reasoning: consistent behavior across every online-mode AI
// call in this app, not a new convention invented here).
const STRUCTURED_INSTRUCTION =
  "IMPORTANT: Your response must be ONLY valid JSON. Do not include markdown code fences or explanatory text. Start directly with { and end with }.";

const CLASSIFY_SYSTEM = `You are classifying an email for a legal case-management app. Given a subject line and a short snippet, decide whether it plausibly relates to a specific legal case/matter. Respond with JSON: {"isCaseRelated": boolean, "reason": string}.\n\n${STRUCTURED_INSTRUCTION}`;

export type ClassifyResult = { isCaseRelated: boolean; reason: string } | { error: string; status: number };

export async function classifyEmail(userId: string, tier: "free" | "pro", subject: string, snippet: string): Promise<ClassifyResult> {
  const quota = await checkQuota(userId, tier);
  if (!quota.ok) {
    return { error: "You've used your monthly AI allowance for this billing period.", status: 402 };
  }

  const prompt = `Subject: ${subject}\n\nSnippet: ${snippet}`;

  try {
    const result = await generateText({ model: gateway(CLASSIFICATION_MODEL), system: CLASSIFY_SYSTEM, prompt });
    const inputTokens = result.usage?.inputTokens ?? 0;
    const outputTokens = result.usage?.outputTokens ?? 0;
    const costCents = computeCostCents(CLASSIFICATION_MODEL, inputTokens, outputTokens);

    await recordUsage(userId, costCents);
    await recordAiRequest({
      userId,
      purpose: "email_classification",
      model: CLASSIFICATION_MODEL,
      prompt,
      response: result.text,
      inputTokens,
      outputTokens,
      costCents,
      finishReason: result.finishReason,
    });

    const parsed = JSON.parse(result.text) as { isCaseRelated?: boolean; reason?: string };
    return { isCaseRelated: Boolean(parsed.isCaseRelated), reason: parsed.reason ?? "" };
  } catch (err) {
    await recordAiRequest({ userId, purpose: "email_classification", model: CLASSIFICATION_MODEL, prompt, errorCode: "provider_error" });
    return { error: err instanceof Error ? err.message : "Classification failed", status: 502 };
  }
}
