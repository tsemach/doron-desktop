import { EstimateUnit } from "./types";

const SHORTHAND_PATTERN = /^(\d+(?:\.\d+)?)\s*([dh])$/i;

export interface Estimate {
  value: number;
  unit: EstimateUnit;
}

// Parses UI shorthand like "3d", "0.5d", "4h", "10h" into a structured
// (value, unit) pair. Returns null for anything that doesn't match —
// callers surface that as a validation error rather than guessing.
export function parseEstimateShorthand(input: string): Estimate | null {
  const match = SHORTHAND_PATTERN.exec(input.trim());
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!(value > 0)) return null;
  const unit: EstimateUnit = match[2].toLowerCase() === "d" ? "day" : "hour";
  return { value, unit };
}

export function formatEstimateShorthand(value: number, unit: EstimateUnit): string {
  return `${value}${unit === "day" ? "d" : "h"}`;
}
