import { and, eq, sql } from "drizzle-orm";
import { db } from "../../database";
import { aiRequests, aiUsagePeriods } from "../../database/schema";
import { getPlanForTier } from "./plans";

// UTC calendar month ("2026-07"), not a subscription-anniversary period --
// there's no real subscription billing engine yet, so usage is bucketed
// by calendar month as a deliberate simplification (see
// docs/ai-online-proxy/ai_online_proxy_architecture.md §5.3).
function currentBillingPeriod(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}`;
}

export async function getCurrentPeriodSpendCents(userId: string): Promise<number> {
  const period = currentBillingPeriod();
  const [row] = await db
    .select({ costCents: aiUsagePeriods.costCents })
    .from(aiUsagePeriods)
    .where(and(eq(aiUsagePeriods.userId, userId), eq(aiUsagePeriods.billingPeriod, period)))
    .limit(1);
  return row?.costCents ?? 0;
}

export type QuotaCheckResult = { ok: true } | { ok: false; budgetCents: number; spentCents: number };

/**
 * Pre-request quota check. Called before streamText() -- a request must
 * never reach the Gateway once this returns ok: false.
 */
export async function checkQuota(userId: string, tier: "free" | "pro"): Promise<QuotaCheckResult> {
  const plan = await getPlanForTier(tier);
  if (!plan) {
    // No plan row (e.g. "free") means not entitled to cloud AI at all.
    return { ok: false, budgetCents: 0, spentCents: 0 };
  }
  const spentCents = await getCurrentPeriodSpendCents(userId);
  if (spentCents >= plan.monthlyBudgetCents) {
    return { ok: false, budgetCents: plan.monthlyBudgetCents, spentCents };
  }
  return { ok: true };
}

/**
 * Records spend against the user's current billing period, upserting the
 * running total. Called on both clean completion and mid-stream failure
 * with partial usage -- tokens the provider already generated were already
 * billed by the provider, whether or not the response finished cleanly.
 */
export async function recordUsage(userId: string, costCents: number): Promise<void> {
  const period = currentBillingPeriod();
  await db
    .insert(aiUsagePeriods)
    .values({ userId, billingPeriod: period, costCents })
    .onConflictDoUpdate({
      target: [aiUsagePeriods.userId, aiUsagePeriods.billingPeriod],
      set: {
        costCents: sql`${aiUsagePeriods.costCents} + ${costCents}`,
        updatedAt: new Date(),
      },
    });
}

export interface RecordAiRequestInput {
  userId: string;
  conversationId?: string | null;
  purpose: "chat" | "email_classification" | "field_extraction" | "doc_indexing" | "query_analysis";
  model: string;
  prompt?: unknown;
  response?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  finishReason?: string | null;
  errorCode?: "rate_limited" | "quota_exceeded" | "provider_error" | null;
}

/** Inserts one ai_requests detail row -- the source of truth ai_usage_periods is derived from. */
export async function recordAiRequest(input: RecordAiRequestInput): Promise<void> {
  await db.insert(aiRequests).values({
    userId: input.userId,
    conversationId: input.conversationId ?? null,
    purpose: input.purpose,
    model: input.model,
    prompt: input.prompt ?? null,
    response: input.response ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    costCents: input.costCents ?? null,
    finishReason: input.finishReason ?? null,
    errorCode: input.errorCode ?? null,
  });
}
