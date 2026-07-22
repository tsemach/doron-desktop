import { getDefaultStore, useAtomValue } from "jotai";
import { sessionAtom } from "@/store/authStore";

export type FeatureKey = "voice_recording" | "emails" | "ai_features";
export type SubscriptionTier = "free" | "pro";
export type GateState = "enabled" | "disabled";

/**
 * Central hardcoded registry of feature gates. Each feature's enable/disable
 * state is set independently per tier (e.g. voice_recording.free can be
 * flipped without touching voice_recording.pro). Feature keys here should
 * match 1:1 with gate names created in Statsig when we migrate off the
 * hardcoded provider (see StatsigFeatureGateProvider below).
 */
const FEATURE_GATES: Record<FeatureKey, Record<SubscriptionTier, GateState>> = {
  voice_recording: { free: "disabled", pro: "enabled" },
  emails: { free: "disabled", pro: "enabled" },
  // Covers the hard-blocked AI surfaces (voice transcription, field
  // extraction, cloud AI settings/health check, cloud model install) --
  // Local AI stays intentionally excluded from this gate (deprecated, being
  // removed later); indexing metadata extraction and search reranking are
  // also excluded since those degrade gracefully to a non-AI fallback
  // instead of being blocked outright (see PLAN.md Phase 3).
  ai_features: { free: "disabled", pro: "enabled" },
};

export interface FeatureGateProvider {
  isEnabled(feature: FeatureKey, tier: SubscriptionTier): boolean;
}

class LocalFeatureGateProvider implements FeatureGateProvider {
  isEnabled(feature: FeatureKey, tier: SubscriptionTier): boolean {
    return FEATURE_GATES[feature]?.[tier] === "enabled";
  }
}

/*
 * Statsig swap point (not implemented -- infra only). Once statsig-js is
 * installed and initialized elsewhere in the app, migrate by implementing
 * this and pointing `featureGateProvider` at it instead:
 *
 * class StatsigFeatureGateProvider implements FeatureGateProvider {
 *   isEnabled(feature: FeatureKey, tier: SubscriptionTier): boolean {
 *     return statsig.checkGate(
 *       { userID: getCurrentUserId(), custom: { tier } },
 *       feature
 *     );
 *   }
 * }
 *
 * Each FeatureKey should become a gate of the same name in the Statsig
 * console, with a rule scoped to `custom.tier == "pro"` mirroring today's
 * FEATURE_GATES table.
 */

export const featureGateProvider: FeatureGateProvider = new LocalFeatureGateProvider();

/**
 * Reads the real session (apps/desktop/src/store/authStore.ts) rather than
 * a hardcoded stub. `sessionAtom` already holds `null` for signed-out and
 * for a locally-cached session past its `expires_at` (see
 * authStore.ts::refreshSession), so there's no separate TTL check needed
 * here -- reading the atom's current value is enough. Falls back to "free"
 * whenever there's no valid session, so a stale/missing read never silently
 * grants Pro.
 */
export function getCurrentSubscriptionTier(): SubscriptionTier {
  const session = getDefaultStore().get(sessionAtom);
  return session?.tier === "pro" ? "pro" : "free";
}

export function isFeatureEnabled(feature: FeatureKey): boolean {
  return featureGateProvider.isEnabled(feature, getCurrentSubscriptionTier());
}

/**
 * Reactive counterparts to getCurrentSubscriptionTier/isFeatureEnabled --
 * those read the session atom's current value directly (fine for one-off
 * checks), but a component that needs to re-render when the session changes
 * (e.g. after verify_session revalidates it) must actually subscribe via
 * useAtomValue rather than just reading the store once.
 */
export function useSubscriptionTier(): SubscriptionTier {
  const session = useAtomValue(sessionAtom);
  return session?.tier === "pro" ? "pro" : "free";
}

export function useFeatureEnabled(feature: FeatureKey): boolean {
  const tier = useSubscriptionTier();
  return featureGateProvider.isEnabled(feature, tier);
}
