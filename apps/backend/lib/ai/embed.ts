import { gateway, embed } from "ai";
import { checkQuota, recordAiRequest, recordUsage } from "./usage";

// An internal function, not a separate HTTP route -- see
// docs/backend-saas/phase-5-search-indexing/design.md's original plan for
// a sibling /api/v1/ai/embed route, corrected during implementation:
// /complete's authorizeRequest is desktop-token auth, but this feature's
// only caller is the browser-based Documents panel (cookie session, no
// desktop token to present). Reusing /complete's Gateway/quota/billing
// pattern here directly, called from within the cookie-authenticated
// api/v1/documents/[id]/index route rather than exposed as its own
// endpoint nothing could actually reach.

const EMBEDDING_MODEL = "openai/text-embedding-3-small"; // 1536 dimensions, matching document_chunks.embedding
const EMBEDDING_CENTS_PER_MILLION_TOKENS = 2; // OpenAI's list price at time of writing -- not independently re-verified, same caveat as lib/ai/pricing.ts

export type EmbedResult = { vector: number[] } | { error: string; status: number };

type EmbedPurpose = "doc_indexing" | "query_analysis";

export async function embedText(userId: string, tier: "free" | "pro", text: string, purpose: EmbedPurpose = "doc_indexing"): Promise<EmbedResult> {
  const quota = await checkQuota(userId, tier);
  if (!quota.ok) {
    return { error: "You've used your monthly AI allowance for this billing period.", status: 402 };
  }

  try {
    const result = await embed({ model: gateway.textEmbeddingModel(EMBEDDING_MODEL), value: text });
    const inputTokens = result.usage?.tokens ?? 0;
    const costCents = Math.ceil((inputTokens / 1_000_000) * EMBEDDING_CENTS_PER_MILLION_TOKENS);

    await recordUsage(userId, costCents);
    await recordAiRequest({
      userId,
      purpose,
      model: EMBEDDING_MODEL,
      prompt: text,
      inputTokens,
      costCents,
      finishReason: "stop",
    });

    return { vector: result.embedding };
  } catch (err) {
    await recordAiRequest({ userId, purpose, model: EMBEDDING_MODEL, prompt: text, errorCode: "provider_error" });
    return { error: err instanceof Error ? err.message : "Embedding failed", status: 502 };
  }
}
