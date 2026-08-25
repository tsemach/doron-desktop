import { describe, expect, it } from "vitest";
import type { FeatureKey } from "./featureGating";
import { featureGateProvider, getFeatureState, isFeatureEnabled } from "./featureGating";

// Deliberately doesn't assert which keys are enabled/disabled today -- that's
// mutable product config (see FEATURE_GATES), not a stable invariant. These
// tests cover the gating logic itself so they stay green regardless of how
// FEATURE_GATES is currently set.
const ALL_KEYS: FeatureKey[] = ["app", "cases", "calendar", "documents", "billing"];

describe("featureGating", () => {
  it("returns a valid GateState for every feature key", () => {
    for (const key of ALL_KEYS) {
      expect(["enabled", "disabled"]).toContain(getFeatureState(key));
    }
  });

  it("isFeatureEnabled is true exactly when the gate state is enabled", () => {
    for (const key of ALL_KEYS) {
      expect(isFeatureEnabled(key)).toBe(getFeatureState(key) === "enabled");
    }
  });

  it("delegates through the exported provider", () => {
    for (const key of ALL_KEYS) {
      expect(featureGateProvider.getState(key)).toBe(getFeatureState(key));
    }
  });
});
