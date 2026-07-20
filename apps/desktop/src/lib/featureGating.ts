export type FeatureKey = "voice_recording" | "emails";
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
};

/**
 * Stand-in for the desktop app's current subscription tier. There is no
 * auth/billing integration yet, so this is a hardcoded constant a developer
 * edits to test the "pro" path -- swap point for whatever reads the real
 * subscription once that exists.
 */
const CURRENT_TIER: SubscriptionTier = "pro";

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

export function getCurrentSubscriptionTier(): SubscriptionTier {
  return CURRENT_TIER;
}

export function isFeatureEnabled(feature: FeatureKey): boolean {
  return featureGateProvider.isEnabled(feature, getCurrentSubscriptionTier());
}
