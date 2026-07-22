import { describe, expect, it } from "vitest";
import { isValidEmail, isValidFullName, isValidPasswordLength } from "./validation";

describe("isValidEmail", () => {
  it("accepts a normal email", () => {
    expect(isValidEmail("jane@example.com")).toBe(true);
  });

  it("accepts a subdomain / plus-addressed email", () => {
    expect(isValidEmail("jane+test@mail.example.co.il")).toBe(true);
  });

  it("rejects a string with no @", () => {
    expect(isValidEmail("blah.blah")).toBe(false);
  });

  it("rejects an @ with no domain dot", () => {
    expect(isValidEmail("blah@blah")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects a string with a space", () => {
    expect(isValidEmail("jane doe@example.com")).toBe(false);
  });

  it("rejects a string with two @", () => {
    expect(isValidEmail("jane@@example.com")).toBe(false);
  });
});

describe("isValidPasswordLength", () => {
  it("rejects shorter than 6 characters", () => {
    expect(isValidPasswordLength("abc12")).toBe(false);
  });

  it("accepts exactly 6 characters", () => {
    expect(isValidPasswordLength("abc123")).toBe(true);
  });

  it("accepts exactly 16 characters", () => {
    expect(isValidPasswordLength("a".repeat(16))).toBe(true);
  });

  it("rejects longer than 16 characters", () => {
    expect(isValidPasswordLength("a".repeat(17))).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidPasswordLength("")).toBe(false);
  });
});

describe("isValidFullName", () => {
  it("accepts a normal English name", () => {
    expect(isValidFullName("Jonh Smith Junior")).toBe(true);
  });

  it("accepts a name with an apostrophe", () => {
    expect(isValidFullName("Sean O'Brien")).toBe(true);
  });

  it("accepts a hyphenated name", () => {
    expect(isValidFullName("Jean-Luc Picard")).toBe(true);
  });

  it("accepts an initial with a period", () => {
    expect(isValidFullName("J. Cohen")).toBe(true);
  });

  it("accepts a Hebrew name", () => {
    expect(isValidFullName("צמח מזרחי")).toBe(true);
  });

  it("rejects digits", () => {
    expect(isValidFullName("John123")).toBe(false);
  });

  it("rejects angle brackets (script-tag shaped input)", () => {
    expect(isValidFullName("<script>alert(1)</script>")).toBe(false);
  });

  it("rejects SQL-injection-shaped input", () => {
    expect(isValidFullName("'; DROP TABLE users; --")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidFullName("")).toBe(false);
  });

  it("rejects a string over 100 characters", () => {
    expect(isValidFullName("a".repeat(101))).toBe(false);
  });

  it("trims surrounding whitespace before checking", () => {
    expect(isValidFullName("  Jane Doe  ")).toBe(true);
  });
});
