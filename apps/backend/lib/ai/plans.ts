import { eq } from "drizzle-orm";
import { db } from "../../database";
import { plans } from "../../database/schema";

/**
 * Looks up the monthly AI plan for a tier. Returns null for a tier with no
 * row (e.g. "free") -- the usage service treats that as "not entitled to
 * cloud AI", not a $0 budget.
 */
export async function getPlanForTier(tier: "free" | "pro") {
  const [row] = await db.select().from(plans).where(eq(plans.tier, tier)).limit(1);
  return row ?? null;
}
