import { describe, expect, it } from "vitest";
import { extractCasePhrase, normalizeForMatch } from "./caseMatch";

describe("extractCasePhrase", () => {
  it("extracts an English case phrase", () => {
    expect(extractCasePhrase("Please see case: Smith v. Jones for details")).toBe("Smith v. Jones for details");
  });

  it("extracts a Hebrew case phrase", () => {
    expect(extractCasePhrase("בנוגע ל תיק: תביעה בגין רשלנות")).toBe("תביעה בגין רשלנות");
  });

  it("stops at a newline", () => {
    expect(extractCasePhrase("case: Acme Corp\nSome other line")).toBe("Acme Corp");
  });

  it("is case-insensitive on the label", () => {
    expect(extractCasePhrase("CASE: Acme Corp")).toBe("Acme Corp");
  });

  it("returns null when no phrase is present", () => {
    expect(extractCasePhrase("Just a regular email with no case reference")).toBeNull();
  });

  it("accepts a hyphen delimiter", () => {
    expect(extractCasePhrase("case - Acme Corp")).toBe("Acme Corp");
  });
});

describe("normalizeForMatch", () => {
  it("lowercases and trims", () => {
    expect(normalizeForMatch("  Smith v. Jones  ")).toBe("smith v jones");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeForMatch("Acme   Corp")).toBe("acme corp");
  });

  it("strips common punctuation", () => {
    expect(normalizeForMatch("Acme, Corp. (Ltd.)")).toBe("acme corp ltd");
  });

  it("leaves Hebrew text intact aside from whitespace/punctuation", () => {
    expect(normalizeForMatch("תביעה בגין רשלנות")).toBe("תביעה בגין רשלנות");
  });

  it("two differently-formatted equivalent phrases normalize to the same value", () => {
    expect(normalizeForMatch("Smith v. Jones")).toBe(normalizeForMatch("  smith V JONES  "));
  });
});
