# Multi-role Users & Roles — Design

Design for [ASC-142](https://linear.app/amicusx/issue/ASC-142/add-multi-roles-users-support) — introducing
`admin`/`manager`/`user` roles, `firm`/`team` grouping, email-invitation onboarding, and self-registered
"flat" users, on top of `apps/backend`'s currently flat `users` table.

Companion to [`implementation_plan.md`](./implementation_plan.md), which phases this into buildable steps.

---

## 1. Goals and non-goals

**Goals**

1. A user belongs to exactly one role: `admin`, `manager`, `user`, or `flat` (rules 1–4 in ASC-142).
2. Admin- and manager-driven onboarding is invitation-only, by email (rules 1–3).
3. An admin account can only ever be created by an Ascurix staff member from `apps/office`, never
   self-service (rule 2).
4. Every non-flat user belongs to exactly one firm; firms are fully isolated from each other (rules
   8–10).
5. Admins can change a user's role between `user` and `manager` (never to/from `admin`), and can
   soft-delete a user or manager (rules 11–12).
6. Self-registered ("flat") users keep today's full-access behavior, don't belong to a firm, and can
   form a peer group with other flat users (rule 13).
7. All of the above is manageable from a new **"Users and Roles"** section in the desktop app's
   Settings screen, available on every subscription tier.
8. The backend API is usable by more than the desktop app — a browser-based SaaS surface (hosted in
   `apps/backend` itself, same origin) is expected later. The API is designed for this from Phase 2
   onward (see §5); the browser UI itself is deferred (§7).

**Non-goals — explicitly out of scope for this issue**

- **Cross-user visibility into case/document content.** ASC-142's rules 5–7 say a manager/admin "can
  see all the data of its users." Today, case and document data lives *only* in each desktop
  installation's local SQLite database (`apps/desktop/src-tauri/src/store/mod.rs`'s `cases` table has
  no owner/tenant column at all), with no cloud sync layer — a gap already flagged as out of scope in
  `PRD.md` §9 / `PLAN.md`. Building that sync layer is a separate, much larger effort. This design
  implements rules 5–7 as **roster visibility** (who is on a manager's/admin's team, their name, email,
  and role) — not access to their actual cases or documents. Confirmed with the product owner before
  writing this design.
- **Tier gating.** Unlike `ai_features`/`voice_recording` (Pro-only, see `featureGating.ts`), this
  entire feature is available on Free and Pro alike. No new billing/plan work.
- **A browser SaaS UI for this feature.** The backend API is built to support one from Phase 2 onward
  (goal 8, §5) — same-origin cookie auth in `apps/backend`, no separate CORS/cross-origin work needed
  when it's built — but the pages themselves are a later, separate phase. §7 has the detail.
- **Office staff role changes.** Rule 11 scopes role changes to a firm's own admin; `apps/office`
  staff are not given a parallel "change any user's role" capability here.
- **NextAuth OAuth-path soft-delete enforcement.** Flagged as a known gap (§6) rather than solved here
  — see the migration notes in the implementation plan.

## 2. What exists vs. what is missing

| Capability | Status | Location |
|---|---|---|
| Single flat `users` table, `tier` (free/pro) only | ✅ | `packages/backend-orm/src/schema.ts` |
| NextAuth session carrying `tier`/`planSelectedAt` | ✅ | `apps/backend/auth.config.ts`, `auth.ts` |
| Desktop bearer-token session (`desktopSessions`, token-in-body, no header) | ✅ | `apps/backend/lib/desktopSession.ts`, `apps/desktop/src-tauri/src/auth/mod.rs` |
| Desktop app fully gated behind a valid session (`AUTH_REQUIRED = true`) | ✅ | `apps/desktop/src/App.tsx` |
| Self-service signup → flat account, email verification | ✅ | `apps/backend/app/api/v1/auth/signup/route.ts`, `lib/emailVerification.ts` |
| Token+TTL pattern for a single-use email link | ✅ | `lib/emailVerification.ts` (to mirror for invitations) |
| Token-in-body auth helper for desktop-callable backend routes | ✅ | `apps/backend/lib/ai/auth.ts::authorizeRequest` (to extend/generalize) |
| `apps/office` staff back-office, own separate `admin_users` table/DB | ✅ | `apps/office/database/schema.ts` — unrelated to the roles this design adds |
| `apps/office` admin-invites-admin precedent (staff table only) | ✅ | `apps/office/app/api/v1/admin/register/route.ts` (pattern to mirror, wrong table) |
| Desktop Settings screen: tabbed layout, per-tab component + help panel | ✅ | `apps/desktop/src/components/Settings/{Settings.tsx,SettingMenuTab.tsx}` |
| **`role`/`firmId` on `users`** | ❌ | — |
| **`firms`, `teams`, `invitations`, flat peer-group tables** | ❌ | — |
| **Permission model (who can invite/edit-role/delete/list whom)** | ❌ | — |
| **Roster-scoped API (org invitations/roster/role-change/delete)** | ❌ | — |
| **"Users and Roles" desktop Settings tab** | ❌ | — |
| **Office → firm-admin invitation flow** | ❌ | — |

## 3. Data model

Add to `users` (`packages/backend-orm/src/schema.ts`):

- `role: enum["admin","manager","user","flat"]`, default `"flat"` — same style as the existing `tier`
  column. A single enum column, not a separate roles table: the four roles are mutually exclusive by
  the issue's own rules, so a join table would be unused generality.
- `firmId: -> firms.id`, nullable (flat users have none).
- `deletedAt: timestamp`, nullable — soft-delete marker (rule 12).

New tables:

- **`firms`** — `id, name, createdAt, updatedAt`. Only ever created by the office invite-admin flow
  (rule 9: a firm is defined when its admin is created).
- **`teams`** — `id, firmId -> firms.id cascade, managerId -> users.id, name, createdAt`. `managerId`
  is not unique, so one manager can own several teams (rule 4).
- **`teamMembers`** — `(teamId -> teams.id cascade, userId -> users.id cascade)` composite PK. A
  member can itself hold `role = "manager"` and separately own its own team(s) — this join table is
  how rule 6 ("manager can manage a team of managers") is represented. Deliberately **no**
  `users.managerId` column: a user's manager is derived by walking `teamMembers → teams.managerId`.
  Adding both would create two sources of truth for "who manages this person" that can drift; the
  join table alone is sufficient and is the single source of truth.
- **`invitations`** — `id, email, role enum["admin","manager","user","flat"], firmId (nullable only
  for the office's pre-firm admin invite), teamId (nullable), invitedByUserId (nullable), token
  (unique, `randomBytes(32).hex` — same construction as `emailVerification.ts`), expiresAt,
  acceptedAt (nullable), createdAt`. A dedicated table rather than reusing `verificationTokens`,
  since an invitation carries a role/firm/team payload that an identifier+token+expires row can't.
- **`flatGroups`** / **`flatGroupMembers`** — models rule 13's non-hierarchical flat-user peer group.
  A flat user belongs to at most one group. An `invitations.role = "flat"` acceptance creates the
  inviter's group (if it doesn't exist yet) and adds both parties, instead of touching `firmId`.

**Security-critical invariant:** an `invitations` row with `role = "admin"` may only be created by the
office app's staff-only route (§5). The firm-facing invite API (used by admins/managers from the
desktop app) must never be able to produce one — enforced in the permission model (§4), not by
convention alone.

## 4. Permission model

New `apps/backend/lib/permissions.ts` — pure, unit-testable functions (same style as
`lib/verifyCredentials.ts`):

- `canInvite(actor, targetRole)` — `admin → manager|user`; `manager → user` only; `flat → flat` only.
  Never true for `targetRole === "admin"`, regardless of actor (rule 2).
- `canChangeRole(actor, target)` — `admin` only, target currently `manager`/`user` (never `admin`/
  `flat`), same firm (rule 11).
- `canDelete(actor, target)` — `admin` only, same firm; the caller performs a soft delete, never a
  hard delete (rule 12).
- `getVisibleRosterUserIds(db, actor)` — the roster-scoping function behind rules 5–7:
  - `admin`: every user with `firmId === actor.firmId`.
  - `manager`: BFS from the teams they own (`teams.managerId === actor.id`) through `teamMembers`,
    recursing into any member who is themself a manager (their owned teams too), depth-capped to
    guard against an accidental cycle.
  - `user`: themself only.
  - `flat`: themself plus their `flatGroupMembers` peers.

## 5. Auth/session and API surface

Session plumbing mirrors the existing `tier` flow field-for-field — `auth.config.ts`/`auth.ts`'s
JWT+session callbacks, the Rust `Session` struct (`apps/desktop/src-tauri/src/auth/mod.rs`),
`authStore.ts`, and the `desktop-login`/`desktop-session` routes all gain `role`/`firmId` alongside
`tier`, using the exact same "always re-fetch fresh from `users`" pattern already in place (so a role
change takes effect on the next check, not after a 30-day token TTL).

Backend API, two auth styles sharing one set of business-logic functions
(`apps/backend/lib/org/{roster,invitations}.ts`) — mirroring how `desktop-login` and NextAuth's
Credentials provider already share `verifyCredentials.ts`. Neither is "the primary" surface; they're
peers for two different callers that both need to exist (goal 8):

- **Cookie-authenticated** (`apps/backend/app/api/v1/org/...`, `auth()`) — for a browser calling
  `apps/backend` directly (same origin, so the existing NextAuth session cookie just works, no CORS
  or cross-site cookie handling needed). Re-fetches `role`/`firmId` fresh from `users` rather than
  trusting the JWT, so this family works correctly even before the session-plumbing work in §5 lands.
  No web UI calls it yet (§7) — Phase 2 builds the route, the page comes later.
- **Token-in-body** (`apps/backend/app/api/v1/org/desktop/...`) — called from the desktop app's Rust
  layer, authenticated via a new `authorizeOrgRequest(token)` that extends `lib/ai/auth.ts`'s existing
  `authorizeRequest` lookup to also select `role`/`firmId`. Necessary because the Tauri webview can't
  persist a browser cookie across restarts (same reason `desktop-login`/`verify_session` already work
  this way).
- **Public, unauthenticated** — `GET/POST /api/v1/org/invitations/[token]` (and its `/accept`), since
  the invitee has no account yet.

`apps/office` gets one new staff-only route that creates a `firms` row and an admin-role
`invitations` row — the sole place in the system permitted to mint an admin invitation.

## 6. Known gap to close in the same change

None of the existing `users` lookups (`verifyCredentials.ts`, `desktop-session/route.ts`, the new
`authorizeOrgRequest`) currently know about soft-delete. Each must add a `deletedAt is null` filter as
part of this work, or a soft-deleted account keeps working. NextAuth's `DrizzleAdapter` OAuth sign-in
path has the same blind spot and doesn't get a fix in this design — flagged as a follow-up.

## 7. UI placement

A new **"Users and Roles"** tab in `apps/desktop/src/components/Settings/`, following the screen's
existing per-tab decomposition (`Setting*.tsx` main component + `Setting*Help.tsx` side panel, e.g.
`SettingEmailIntegration.tsx`/`SettingEmailIntegrationHelp.tsx`). Content adapts to the viewer's role:
admin/manager get a manageable roster (invite, change role, remove); `user`/`flat` get a read-only
account/firm summary. Brand-new invitees set their password on a backend-hosted web page (opened via
`openUrl()`, the same convention `AuthLanding.tsx` already uses for registration, since they have no
desktop session yet); an already-signed-in admin/manager manages their roster natively in Settings.

**Browser SaaS UI (goal 8) is explicitly deferred** — no `apps/backend` pages call the cookie-
authenticated `org/*` routes yet. Building it is a later, separate phase/issue: equivalent screens
(roster table, invite dialog, role/remove actions) hosted in `apps/backend` itself, reusing the same
`lib/org/*.ts` business logic the desktop flow already exercises. Decided this way rather than
building both now so the desktop flow — the only UI actually scoped into this plan — ships and is
verified end to end first.
