import { describe, expect, it } from "vitest";
import en from "./en.json";
import he from "./he.json";

describe("translations", () => {
  it("has the exact same key set in en.json and he.json", () => {
    const enKeys = Object.keys(en).sort();
    const heKeys = Object.keys(he).sort();
    expect(heKeys).toEqual(enKeys);
  });

  it("has no empty string values in either dictionary", () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en.${key}`).not.toBe("");
    }
    for (const [key, value] of Object.entries(he)) {
      expect(value, `he.${key}`).not.toBe("");
    }
  });
});
