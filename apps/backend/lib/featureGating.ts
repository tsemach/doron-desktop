export type FeatureKey = "app" | "cases" | "calendar" | "documents" | "billing";
export type GateState = "enabled" | "disabled";

/**
 * Central hardcoded registry of feature gates for the /app section. "app"
 * is the top-level gate for the whole section (checked in app/app/layout.tsx
 * and the "/" -> "/app" login redirect); the rest gate one nav section each.
 * Feature keys here should match 1:1 with gate names created in an online
 * feature-gate service if/when we migrate off the hardcoded provider (see
 * the swap-point comment below) -- mirrors the equivalent, tier-scoped
 * registry in apps/desktop/src/lib/featureGating.ts.
 */
const FEATURE_GATES: Record<FeatureKey, GateState> = {
  app: "disabled", // TODO: re-enable once the app is ready for public use
  // app: "disabled", // TODO: re-enable once the app is ready for public use
  cases: "disabled",
  calendar: "disabled",
  documents: "disabled",
  billing: "disabled",
};

export interface FeatureGateProvider {
  getState(feature: FeatureKey): GateState;
}

class LocalFeatureGateProvider implements FeatureGateProvider {
  getState(feature: FeatureKey): GateState {
    return FEATURE_GATES[feature];
  }
}

/*
 * Online feature-gate service swap point (not implemented -- infra only).
 * Once a provider is chosen and wired up elsewhere in the app, migrate by
 * implementing this and pointing featureGateProvider at it instead:
 *
 * class RemoteFeatureGateProvider implements FeatureGateProvider {
 *   getState(feature: FeatureKey): GateState {
 *     return remoteClient.checkGate(feature) ? "enabled" : "disabled";
 *   }
 * }
 */

export const featureGateProvider: FeatureGateProvider = new LocalFeatureGateProvider();

export function getFeatureState(feature: FeatureKey): GateState {
  return featureGateProvider.getState(feature);
}

export function isFeatureEnabled(feature: FeatureKey): boolean {
  return getFeatureState(feature) === "enabled";
}
