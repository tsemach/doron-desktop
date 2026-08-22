import { describe, expect, it } from "vitest";
import { computeUrgency } from "./crud";

describe("computeUrgency", () => {
  it("buckets a task due earlier today as due-today, not overdue", () => {
    // The exact bug found during Phase 7's audit: a task due at midnight
    // UTC today (how a date-only <input type="date"> parses) checked
    // against "now" later the same day.
    const dueDate = new Date("2026-08-22T00:00:00Z");
    const now = new Date("2026-08-22T17:00:00Z");
    expect(computeUrgency(dueDate, now)).toBe("due-today");
  });

  it("buckets a task due later today as due-today", () => {
    const dueDate = new Date("2026-08-22T23:00:00Z");
    const now = new Date("2026-08-22T09:00:00Z");
    expect(computeUrgency(dueDate, now)).toBe("due-today");
  });

  it("buckets a task due yesterday as overdue", () => {
    const dueDate = new Date("2026-08-21T12:00:00Z");
    const now = new Date("2026-08-22T09:00:00Z");
    expect(computeUrgency(dueDate, now)).toBe("overdue");
  });

  it("buckets a task due tomorrow as upcoming", () => {
    const dueDate = new Date("2026-08-23T12:00:00Z");
    const now = new Date("2026-08-22T09:00:00Z");
    expect(computeUrgency(dueDate, now)).toBe("upcoming");
  });
});
