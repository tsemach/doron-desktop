import { beforeEach, describe, expect, it, vi } from "vitest";

// getVisibleRosterUserIds issues a small, deterministic sequence of db
// calls per role branch (see the call-order comments on each test below).
// Rather than modeling drizzle's actual query builder, this mock is a
// single thenable chain (every method just returns itself) backed by a
// FIFO queue -- each test pushes one array of rows per expected db call,
// in the order permissions.ts is expected to make them.
const { queueResult, resetQueue, dequeue } = vi.hoisted(() => {
  let queue: unknown[][] = [];
  return {
    queueResult: (rows: unknown[]) => {
      queue.push(rows);
    },
    resetQueue: () => {
      queue = [];
    },
    dequeue: (): unknown[] => (queue.length > 0 ? queue.shift()! : []),
  };
});

vi.mock("../database", () => {
  function makeChain(): any {
    const resolveRows = () => Promise.resolve(dequeue());
    const chain: any = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => resolveRows(),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        resolveRows().then(onFulfilled, onRejected),
    };
    return chain;
  }

  return { db: { select: () => makeChain() } };
});

import {
  canChangeRole,
  canDelete,
  canInvite,
  getVisibleRosterUserIds,
  type Actor,
  type Target,
} from "./permissions";

const admin: Actor = { id: "admin-1", role: "admin", firmId: "firm-1" };
const manager: Actor = { id: "manager-1", role: "manager", firmId: "firm-1" };
const user: Actor = { id: "user-1", role: "user", firmId: "firm-1" };
const flat: Actor = { id: "flat-1", role: "flat", firmId: null };

describe("canInvite", () => {
  it("admin can invite manager or user", () => {
    expect(canInvite(admin, "manager")).toBe(true);
    expect(canInvite(admin, "user")).toBe(true);
  });

  it("nobody can invite an admin through this function -- office-only path", () => {
    expect(canInvite(admin, "admin")).toBe(false);
    expect(canInvite(manager, "admin")).toBe(false);
  });

  it("manager can invite user but not manager", () => {
    expect(canInvite(manager, "user")).toBe(true);
    expect(canInvite(manager, "manager")).toBe(false);
  });

  it("flat can only invite flat", () => {
    expect(canInvite(flat, "flat")).toBe(true);
    expect(canInvite(flat, "user")).toBe(false);
  });

  it("plain user role cannot invite anyone", () => {
    expect(canInvite(user, "user")).toBe(false);
    expect(canInvite(user, "flat")).toBe(false);
  });
});

describe("canChangeRole", () => {
  it("admin can flip a same-firm manager to user and back", () => {
    const targetManager: Target = { id: "t1", role: "manager", firmId: "firm-1" };
    const targetUser: Target = { id: "t2", role: "user", firmId: "firm-1" };
    expect(canChangeRole(admin, targetManager)).toBe(true);
    expect(canChangeRole(admin, targetUser)).toBe(true);
  });

  it("cannot change role across firms", () => {
    const otherFirmUser: Target = { id: "t3", role: "user", firmId: "firm-2" };
    expect(canChangeRole(admin, otherFirmUser)).toBe(false);
  });

  it("cannot change an admin's or a flat user's role", () => {
    expect(canChangeRole(admin, { id: "t4", role: "admin", firmId: "firm-1" })).toBe(false);
    expect(canChangeRole(admin, { id: "t5", role: "flat", firmId: null })).toBe(false);
  });

  it("a manager cannot change roles, only an admin can", () => {
    expect(canChangeRole(manager, { id: "t6", role: "user", firmId: "firm-1" })).toBe(false);
  });
});

describe("canDelete", () => {
  it("admin can delete a same-firm user or manager", () => {
    expect(canDelete(admin, { id: "t1", role: "user", firmId: "firm-1" })).toBe(true);
    expect(canDelete(admin, { id: "t2", role: "manager", firmId: "firm-1" })).toBe(true);
  });

  it("cannot delete across firms, and a manager cannot delete at all", () => {
    expect(canDelete(admin, { id: "t3", role: "user", firmId: "firm-2" })).toBe(false);
    expect(canDelete(manager, { id: "t4", role: "user", firmId: "firm-1" })).toBe(false);
  });
});

describe("getVisibleRosterUserIds", () => {
  beforeEach(() => {
    resetQueue();
  });

  it("admin sees every user in their firm (single users-by-firm query)", async () => {
    queueResult([{ id: "a" }, { id: "b" }, { id: "c" }]);

    const ids = await getVisibleRosterUserIds(admin);

    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("a plain user sees only themself (no db call)", async () => {
    const ids = await getVisibleRosterUserIds(user);
    expect(ids).toEqual(["user-1"]);
  });

  it("manager with no owned teams sees only themself", async () => {
    queueResult([]); // teams owned by manager-1

    const ids = await getVisibleRosterUserIds(manager);

    expect(ids).toEqual(["manager-1"]);
  });

  it("manager sees their team's members", async () => {
    queueResult([{ id: "team-a" }]); // teams owned by manager-1
    queueResult([{ userId: "u1", role: "user" }]); // teamMembers of team-a

    const ids = await getVisibleRosterUserIds(manager);

    expect(ids).toEqual(["manager-1", "u1"]);
  });

  it("recurses into a sub-manager's own team (rule 6, 'team of managers')", async () => {
    queueResult([{ id: "team-a" }]); // teams owned by manager-1
    queueResult([{ userId: "manager-2", role: "manager" }]); // teamMembers of team-a
    queueResult([{ id: "team-b" }]); // teams owned by manager-2
    queueResult([{ userId: "u2", role: "user" }]); // teamMembers of team-b

    const ids = await getVisibleRosterUserIds(manager);

    expect(ids).toEqual(["manager-1", "manager-2", "u2"]);
  });

  it("flat user with no group sees only themself", async () => {
    queueResult([]); // flatGroupMembers row for flat-1

    const ids = await getVisibleRosterUserIds(flat);

    expect(ids).toEqual(["flat-1"]);
  });

  it("flat user in a group sees every member of that group", async () => {
    queueResult([{ groupId: "g1" }]); // flat-1's own membership row
    queueResult([{ userId: "flat-1" }, { userId: "flat-2" }, { userId: "flat-3" }]); // group roster

    const ids = await getVisibleRosterUserIds(flat);

    expect(ids).toEqual(["flat-1", "flat-2", "flat-3"]);
  });
});
