# Multi-role Users & Roles — Implementation Plan

Phased build plan for [`design.md`](./design.md). Parent issue:
[ASC-142](https://linear.app/amicusx/issue/ASC-142/add-multi-roles-users-support) — no sub-issues
exist yet; each phase below is sized to become one once this plan is reviewed.

Ordering principle: every phase ends in something you can run and check — a passing test suite, a
successful migration, an API you can curl, a screen you can click through. Each phase leaves the tree
compiling and the app shippable.

---

## Phase overview

| Phase | Goal | Depends on | Testable by |
|---|---|---|---|
| P1 | Schema: roles, firms, teams, invitations, flat groups | — | `db:generate`/`db:push` succeeds; existing rows backfill to `role="flat"` |
| P2 | Permission model + backend `org` API + invitation email | P1 | `permissions.test.ts` + route tests green |
| P3 | `role`/`firmId` flow through session (web + desktop) | P1 | Manual: sign in, inspect JWT/`Session` for the new fields |
| P4 | `apps/office` → invite firm admin | P1, P2 | Manual: office invite creates `firms`+`invitations` rows, email logged |
| P5 | `apps/desktop`: org Rust commands + "Users and Roles" Settings tab + accept-invite page | P2, P3, P4 | Manual end-to-end flow (see Verification) |

---

## P1 — Schema

**Files:** `packages/backend-orm/src/schema.ts`

1. Add `role`, `firmId`, `deletedAt` to `users`.
2. Add `firms`, `teams`, `teamMembers`, `invitations`, `flatGroups`, `flatGroupMembers` tables (see
   `design.md` §3 for exact columns).
3. `pnpm --filter backend db:generate`, review the generated SQL under `apps/backend/drizzle/`
   (existing numbered-migration convention), then `db:push` against the local dev DB.
4. Confirm existing `users` rows backfilled to `role = "flat"`, `firmId`/`deletedAt` = `NULL`.

No code beyond the schema file changes in this phase — nothing reads the new columns yet, so nothing
else can break.

## P2 — Permissions + backend `org` API

**Files:**
- New `apps/backend/lib/permissions.ts` + `apps/backend/lib/permissions.test.ts`
- New `apps/backend/lib/org/{roster,invitations,auth}.ts`
- New `apps/backend/app/api/v1/org/**` (cookie-authenticated) and
  `apps/backend/app/api/v1/org/desktop/**` (token-in-body) route handlers
- `apps/backend/lib/email/types.ts` (+ mock/resend impls) — add `sendInvitationEmail`
- `apps/backend/lib/verifyCredentials.ts`, `apps/backend/app/api/v1/auth/desktop-session/route.ts` —
  add the `deletedAt is null` filter (design.md §6)

1. Implement `canInvite`/`canChangeRole`/`canDelete`/`getVisibleRosterUserIds` in `permissions.ts`,
   with unit tests covering: non-admin inviting an admin (must fail), manager inviting a manager
   (must fail), manager's recursive roster walk through a "team of managers."
2. Implement `authorizeOrgRequest` in `lib/org/auth.ts`, extending `lib/ai/auth.ts`'s
   `authorizeRequest` lookup to also select `role`/`firmId`.
3. Implement the shared business logic (`lib/org/roster.ts`, `lib/org/invitations.ts`), then both
   route families as thin wrappers — cookie routes use `auth()`, desktop routes use
   `authorizeOrgRequest`.
4. Invitation accept route: create the `users` row from the invitation payload, hash the submitted
   password, stamp `emailVerified` immediately, mark `invitations.acceptedAt` (don't delete the row —
   keeps an audit trail, unlike `consumeEmailVerification`'s delete-on-use).
5. Flat-role branch: `invitations.role === "flat"` acceptance creates/reuses the inviter's
   `flatGroups` row instead of setting `firmId`.
6. Route tests mirroring `signup/route.test.ts`'s mock style: invite/accept/roster/role-change/delete,
   plus the soft-delete-blocks-login case for `verifyCredentials`/`desktop-session`.

## P3 — Session plumbing

**Files:**
- `apps/backend/auth.config.ts`, `apps/backend/auth.ts`
- `apps/backend/app/api/v1/auth/{desktop-login,desktop-session,signup}/route.ts`
- `apps/desktop/src-tauri/src/auth/mod.rs`, `apps/desktop/src-tauri/src/store/mod.rs` (new
  `auth_session` columns/migration)
- `apps/desktop/src/store/authStore.ts`
- New `apps/desktop/src/lib/permissions.ts`

1. Add `role`/`firmId` to the NextAuth JWT/session callbacks, right next to the existing `tier` lines.
2. Add `role`/`firmId` to `desktop-login`/`desktop-session` response bodies.
3. Extend the Rust `Session` struct, the two response-deserialization structs, `read_session_internal`/
   `save_session_internal`'s SQL, and `complete_oauth_login`'s deep-link param extraction.
4. Extend `authStore.ts`'s `Session` TS interface to match.
5. Add `signup/route.ts`'s explicit `role: "flat"` on insert.
6. New `apps/desktop/src/lib/permissions.ts`: `useUserRole`, `useCanManageUsers`, `useIsAdmin`.

Verify manually: sign in via desktop, confirm `get_session` (Tauri command) returns the new fields.

## P4 — `apps/office` firm-admin invitation

**Files:** new `apps/office/app/(dashboard)/firms/invite-admin/page.tsx` +
`apps/office/app/api/v1/org/invite-admin/route.ts`

1. Mirror `app/api/v1/admin/register/route.ts`'s shape (session-gated via office's own `auth()`,
   since `middleware.ts` doesn't cover `/api/*`) but target `apps/backend`'s tables via `backendDb`
   (`lib/backendDb.ts`), not office's own `adminUsers`.
2. Validate `{fullName, email, firmName}`, insert `firms` then `invitations` (`role: "admin"`), send
   the invite email. Recommend duplicating a minimal email-send function into office rather than
   sharing a package, matching the existing `document_templates` duplication precedent.
3. This route is the **only** code path in the system allowed to create a `role: "admin"` invitation.

## P5 — Desktop: org commands + "Users and Roles" Settings tab

**Files:**
- New `apps/desktop/src-tauri/src/org/mod.rs`, registered in `lib.rs`'s `generate_handler![...]`
- `apps/desktop/src/components/Settings/{Settings.tsx,SettingMenuTab.tsx}`
- New `apps/desktop/src/components/Settings/SettingUsersRoles{.tsx,Table.tsx,InviteDialog.tsx,Help.tsx}`
- New `apps/backend/app/accept-invite/page.tsx`

1. Rust commands (`list_roster`, `invite_user`, `change_user_role`, `delete_user`, team CRUD), each
   shaped like `login_with_credentials` — reqwest POST to `/api/v1/org/desktop/...` with the stored
   session token, `Option`-field response structs, non-2xx mapped to `Err`.
2. `SettingMenuTab.tsx`: extend `TabType` with `"users_roles"`, add the nav item (no Pro badge/
   disabled state — available to every tier and every role, content differs by role instead).
3. `SettingUsersRoles.tsx` + children, following the existing `Setting*`/`Setting*Help` decomposition:
   manage view (roster table, invite dialog, role-change/remove) for admin/manager; read-only account
   card for `user`/`flat`.
4. Wire into `Settings.tsx`: `renderActiveTab()` case, `activeHelp` union extended.
5. `accept-invite/page.tsx` on the backend: reads `?token=`, calls the public accept API, sets a
   password, then directs back to desktop login — opened via `openUrl()` exactly like
   `AuthLanding.tsx`'s registration flow, since the invitee has no session yet.

---

## Verification

**Automated:**
- `apps/backend`: `pnpm --filter backend test` — new `permissions.test.ts` + `org/**/*.test.ts`.
- `apps/desktop`: `npx tsc --noEmit`; `cargo check` in `src-tauri`.
- Root: `pnpm lint`.

**Manual end-to-end** (run after P4 and P5 both land):
1. Office `/firms/invite-admin` → mock `EmailProvider` logs the accept link to console.
2. Open `accept-invite?token=...` in a browser, set a password.
3. Desktop app: log in with that email/password → Settings → "Users and Roles" shows `role: admin`,
   a firm roster of one.
4. From desktop, invite a manager → accept via the same email-link flow → log in as them.
5. As the manager, invite a user → accept → log in as them.
6. Confirm the admin's roster view shows everyone in the firm; the manager's roster view shows only
   their own team.
7. As admin, flip the user's role to `manager` and back — confirm it takes effect immediately (no
   re-login needed, per the always-re-fetch session pattern).
8. As admin, soft-delete a user — confirm they disappear from the roster and can no longer
   `desktop-login` or pass `verify_session`.
