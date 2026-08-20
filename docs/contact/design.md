# Contacts — Design

Linear: [ASC-109](https://linear.app/amicusx/issue/ASC-109/add-contacts-to-a-case)

## 1. Goals and non-goals

**Goals**
- Contact information (name, email, phone, organization) is **never stored locally** — it lives exclusively in `apps/backend`'s Postgres database. The desktop app's local SQLite store never holds a contact's fields, only a pointer to one (see §3).
- A per-case "Contacts" view in case details showing the contacts linked to that case.
- Every contact linked to a case also exists in the shared backend contact store — a case never has a "local-only" contact.
- Five ways a contact ends up on a case, per the issue:
  1. An incoming email is approved onto a case → sender is added automatically.
  2. User manually links an existing contact (one they own, or one shared with them) to the case.
  3. User creates a brand-new contact from within a case → it's created in the backend and linked to the case.
  4. User adds contact emails while creating a new case.
  5. User connects their Google account and picks contacts from it.
- **Ownership and sharing model** (see §5 for full detail):
  - Flat users: one global pool, shared by default — no ownership boundary.
  - Firm users (`admin`/`manager`/`user`): contacts are private to their creator by default; a user may explicitly **share** a contact with one other user in the *same firm* by granting them access to the same row (not a copy) — editing the contact updates it for everyone it's shared with, and the share can be revoked. No team- or firm-wide visibility, no team-level permission logic.

**Non-goals (this design)**
- No contact merge/dedupe UI beyond write-time email-uniqueness enforcement (see §3).
- No two-way sync back to Google (read/import only, matching the existing Calendar integration's read-mostly model).
- No team-scoped or firm-wide contact visibility — considered and deliberately rejected (see §5's "Rejected: team-scoped visibility").
- No offline queue for contact writes — see §7 for what that means in practice.
- No bulk import (CSV etc.) — out of scope unless requested later.

## 2. What exists vs. what's missing

Contacts do not exist anywhere in the codebase today — no table, no Rust module, no frontend component, no backend route. This is greenfield. The nearest relative is `case_identifiers` (`apps/desktop/src-tauri/src/store/matcher_schema.rs:11-26`), which stores normalized sender-email strings per case for the email→case matcher (Tier A) — no name/phone/organization, not user-facing, purely local. Its cascade-delete convention is still useful precedent for the local link table.

What a **backend-stored** contacts feature needs to hook into already exists, proven and running in production:

- **Desktop → backend HTTP pattern**: `apps/desktop/src-tauri/src/org/mod.rs` is the template. A single helper, `call_org_desktop(app, path, body)` (org/mod.rs:31-56), does `POST {backend_url}{path}` via `reqwest::Client`, merges the cached session `token` into the JSON body, and turns a non-2xx `{ error }` response into `Err`. Six `#[tauri::command]`s wrap it (`list_org_members`, `invite_org_member`, team CRUD, etc.), all pure Postgres reads/writes with zero local SQLite involvement. A `contacts` module follows this exactly.
- **Auth**: `apps/desktop/src-tauri/src/auth/mod.rs` exposes `get_backend_url(app)` / `get_session_token(app)`, reading the single-row local `auth_session` table (token, email, tier, role, firm_id — cached from the backend at login, never a local source of truth). Server-side, `apps/backend/lib/desktopAuth.ts::authorizeDesktopToken(token)` resolves that token to `{ userId, tier, role, firmId }` by joining `desktopSessions → users`. Org routes wrap this in `apps/backend/lib/org/auth.ts::authorizeOrgRequest(token)` for an `Actor { id, role, firmId }`. Contacts routes reuse `authorizeDesktopToken` directly — no team/firm-role branching is needed (see §5).
- **Backend schema & route idiom**: `packages/backend-orm/src/schema.ts` is the real schema (shared by `apps/backend` and `apps/office`; `apps/backend/database/schema.ts` just re-exports it). `teams` (firmId-scoped, `onDelete: cascade`) is the closest existing shape for a firm-relevant entity, though contacts end up simpler (user-scoped, not firm-scoped — see §5). Route handlers follow `apps/backend/app/api/v1/org/desktop/members/route.ts`'s idiom: read `token` from the POST body → `authorizeDesktopToken(token)` → 401 on failure → call a plain `lib/*.ts` function that does the Drizzle query → `NextResponse.json(...)`.
- **Case detail tabs**: a closed union (`CaseDetailTab` in `CaseDetailSidebar.tsx`) rendered as a column of `SidebarNavButton`s, tab body selected via ternary chains in `CaseManagementOpenCasesDetails.tsx`. Adding a tab is a small, well-worn change (five other tabs already follow this pattern) — unaffected by the backend-storage decision.
- **Email approval**: `confirm_email_alert` (`apps/desktop/src-tauri/src/email/emails_alerts.rs:261`) already calls `case::identifiers::learn_from_confirmed_email` after filing an approved email — a best-effort, non-fatal, purely-local hook today. It becomes the integration point for auto-adding a contact, but doing so now means an HTTP call inside a previously all-local operation (see §7).
- **Google OAuth**: `calendar/oauth.rs` already implements a full loopback-redirect OAuth flow (`connect`, `complete_connect`, `fetch_account_email`, `get_valid_access_token` with refresh) for Google Calendar, persisted in `google_calendar_accounts`. No People API call exists yet, but the plumbing to reuse is proven.

What is genuinely new: there is **no precedent anywhere in this codebase for a local SQLite table that points at a backend Postgres row without caching that row's data.** `documents.case_id`, `case_fields`, `case_annotations` etc. are all local-to-local foreign keys. The `case_contacts` link table (§3) is the first "local row references a remote row by opaque ID" relationship in the app.

## 3. Data model

### 3.1 Backend (Postgres, `packages/backend-orm/src/schema.ts`) — source of truth for contact data

```ts
export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Denormalized at write time from users.role, purely so the two partial unique
  // indexes below can enforce dedupe without a join (Postgres partial-index
  // predicates can only reference columns on the same table).
  accountType: text("account_type", { enum: ["flat", "firm"] }).notNull(),
  name: text("name"),
  email: text("email").notNull(),
  emailNorm: text("email_norm").notNull(),
  phone: text("phone"),
  organization: text("organization"),
  source: text("source", { enum: ["manual", "email", "case_creation", "google"] }).notNull(),
  googleContactId: text("google_contact_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Attribution for edits, since editing is not owner-only (§5) — set to the editor's
  // id on every update, whether that's the owner or a share recipient.
  updatedByUserId: text("updated_by_user_id").references(() => users.id),
});

// Sharing is a reference, not a copy: a row here grants `sharedWithUserId` read/link
// access to `contactId` without duplicating any of its fields. Editing the contact is
// instantly visible to everyone it's shared with, and deleting this row revokes access.
export const contactShares = pgTable("contact_shares", {
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  sharedWithUserId: text("shared_with_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedByUserId: text("shared_by_user_id").notNull().references(() => users.id),
  sharedAt: timestamp("shared_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.contactId, t.sharedWithUserId] }),
}));
```

```sql
-- Flat users share one global pool: an email can exist only once across ALL flat contacts.
CREATE UNIQUE INDEX contacts_email_flat_uniq ON contacts (email_norm) WHERE account_type = 'flat';
-- Firm users each have a private list: an email can exist once per owning user.
CREATE UNIQUE INDEX contacts_email_firm_uniq ON contacts (user_id, email_norm) WHERE account_type = 'firm';
```

No `firmId` or `teamId` column on `contacts` — see §5 for why visibility is resolved entirely from `userId`/`accountType` plus `contact_shares`, not firm/team membership. `contact_shares` itself carries no `firmId` either — the same-firm rule is enforced only at share-creation time and re-checked at every read (§5), by comparing the two users' *current* `firmId` values, not by denormalizing firm onto the share row.

### 3.2 Desktop (local SQLite, `apps/desktop/src-tauri/src/contact/schema.rs`) — link only, no contact fields

```sql
CREATE TABLE IF NOT EXISTS case_contacts (
    case_id           INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    backend_contact_id TEXT   NOT NULL,   -- the Postgres contacts.id (uuid, stored as text)
    source            TEXT    NOT NULL,   -- how *this case* got the link: manual | email | case_creation | google
    added_at          TEXT    NOT NULL,
    PRIMARY KEY (case_id, backend_contact_id)
);
CREATE INDEX IF NOT EXISTS idx_case_contacts_case ON case_contacts(case_id);
```

Mirrors `matcher_schema.rs`'s idempotent `CREATE TABLE IF NOT EXISTS` convention, invoked from `open_db_by_path` in `store/mod.rs` next to `matcher_schema::init_matcher_schema`. Cascades on case delete like `case_annotations`/`case_fields`/`case_identifiers`; there is no local contact row to cascade-delete on the other side — deleting a contact is a backend operation (§4.1) that the desktop never mirrors locally.

**Design decisions:**
- **`email` is the only mandatory contact field.** `name`, `phone`, and `organization` are all nullable — already reflected in the schema above (`email`/`emailNorm` are `.notNull()`, the rest aren't) and in every interface in §6 (`email: String` vs. `name: Option<String>` etc.). A contact created from a bare email address (e.g. the email-approval hook, §4.3, before any name-parsing succeeds) is always valid on its own; nothing else needs to be backfilled for it to exist.
- No local table ever stores `name`/`email`/`phone`/`organization`. `CaseContactsPanel` always renders data fetched live from the backend (§4.5) — there is no local cache of contact fields to go stale or leak.
- `contacts.source` (backend) records how the contact was *first created*; `case_contacts.source` (local) records how it was linked *to this case* — the two can differ, e.g. a contact created manually on Case A (`source='manual'` on the backend row), later linked to Case B by search (`source='manual'` on that case's link row too, since a human picked it — `source` on the link table reflects the *linking* action, not contact creation).
- Dedupe is enforced backend-side by the two partial unique indexes above — any backend write path (email approval, case creation, manual create, Google import) that hits an existing email for that owner/pool upserts rather than erroring.
- A **share** (§5) is a plain `INSERT` into `contact_shares` — the contact itself is never copied. Editing the contact is visible to the owner and every current share recipient simultaneously; deleting the `contact_shares` row (unshare) or the contact itself (cascade) removes the recipient's access immediately.

## 4. Components

### 4.1 Backend — `packages/backend-orm/src/schema.ts` + `apps/backend/`
- `contacts` table (§3.1).
- `apps/backend/lib/contacts/auth.ts` — thin wrapper around `authorizeDesktopToken`, exposing `Actor { id, accountType, firmId }`. No role/team logic needed (see §5) beyond resolving the actor's identity and account type.
- `apps/backend/lib/contacts/crud.ts` — plain Drizzle functions: `listVisibleContacts(actor)` (flat: all `accountType='flat'` rows; firm: owned rows `UNION` rows joined through `contact_shares` where the share is still same-firm as of *now*, not just at share time — §5), `createContact(actor, fields)`, `updateContact(actor, id, fields)` (owner **or** a current live-share recipient may edit — the same "can see it" check as `listVisibleContacts`, not an owner-only check; sets `updatedByUserId = actor.id`), `deleteContact(actor, id)` (must own the row; cascades `contact_shares`, revoking every recipient's access), `shareContact(actor, contactId, recipientUserId)` (§5), `unshareContact(actor, contactId, recipientUserId)` (owner-only, deletes the `contact_shares` row), `getContactsByIds(actor, ids)` (authorization-filtered batch fetch, used by the desktop's `list_contacts_for_case`).
- `apps/backend/app/api/v1/contacts/desktop/route.ts` (+ `share/route.ts`, `unshare/route.ts`, `by-ids/route.ts`) — Next.js route handlers following the `org/desktop/members/route.ts` idiom: `token` from body → `authorizeDesktopToken` → 401 on failure → call the `lib/contacts/*` function → `NextResponse.json(...)`.

### 4.2 Desktop Rust HTTP client — `apps/desktop/src-tauri/src/contact/`
- `schema.rs` — the local `case_contacts` link table (§3.2) only.
- `mod.rs` — a `call_contacts_desktop(app, path, body)` helper cloned from `org/mod.rs::call_org_desktop`, plus:
  - `list_contacts(app)` → `POST /api/v1/contacts/desktop/list` (backend call only).
  - `create_contact(app, name?, email, phone?, organization?)` → `POST /api/v1/contacts/desktop` (backend call, `source='manual'`), returns the created `Contact` including its backend id.
  - `update_contact(app, id, ...)`, `delete_contact(app, id)` → backend calls.
  - `share_contact(app, contact_id, recipient_user_id)` → `POST /api/v1/contacts/desktop/share`.
  - `unshare_contact(app, contact_id, recipient_user_id)` → `POST /api/v1/contacts/desktop/unshare`.
  - `list_contacts_for_case(app, case_id)` → reads local `case_contacts` for `backend_contact_id`s, then `POST /api/v1/contacts/desktop/by-ids` to fetch current details for exactly those, filtered server-side to ones the caller can still see (handles the edge case in §8).
  - `add_contact_to_case(app, case_id, backend_contact_id)` / `remove_contact_from_case(app, case_id, backend_contact_id)` — pure local `case_contacts` inserts/deletes, no backend call.
- Registered in `lib.rs`'s `generate_handler![]` next to the existing `org::*`/`case::*` blocks.

### 4.2a Organization suggestion wiring
Case creation's "Organization" field (`CaseManagementOrganizationField.tsx`) autocompletes from `list_tag_values("organization")` (`apps/desktop/src-tauri/src/tags/mod.rs`), which is just `SELECT DISTINCT value FROM tags WHERE name = 'organization'` against the local `tags` table (`scope_type`/`scope_value`/`name`/`value`/`type`) — no separate "known organizations" table exists; a value becomes a future suggestion the moment any row with `name='organization'` is written, regardless of scope (the query ignores `scope_type`). Case creation writes one such row today, scoped to that case (`scope_type='case'`).

Contacts aren't case-scoped, so `create_contact`/`update_contact` in `contact/mod.rs` write their organization-tag row with `scope_type='app'` (the existing sentinel used for global/identity tags like `username`/`useremail`, not tied to a specific case) instead. Concretely: after the backend `create_contact`/`update_contact` call succeeds and `organization` is non-empty, the command handler makes one additional **local** write — reusing whatever internal function `tags::add_tag` calls under the hood, not a second round-trip through the public command — inserting/updating a `tags` row (`scope_type='app'`, `name='organization'`, `value=<organization>`, `type='user'`). This is a purely local SQLite write, not a network call, so it's exempt from §7's offline-safety concerns — but it's still a secondary effect that must not fail contact creation/update if it errors (wrap it the same best-effort way, log and swallow).

Net effect: type an organization into a new contact once, and it shows up as a suggestion in the case-creation Organization field (and anywhere else `list_tag_values("organization")` is used) from then on, exactly like typing a new one there does today — same underlying mechanism, just a second writer.

### 4.3 Email approval hook
`case::identifiers::learn_from_confirmed_email` gains a second effect: call `contact::create_contact` (or an equivalent internal helper) for `alert.sender`, then insert a local `case_contacts` row with `source='email'`. Best-effort exactly like the existing `case_identifiers` write — see §7 for what "best-effort" now has to account for (network failure, not just a SQL error).

### 4.4 Case-creation hook
`create_new_case` gains an optional `contact_emails: Vec<String>` parameter. For each: call the backend to create/upsert the contact, then insert the local `case_contacts` link with `source='case_creation'`. Unlike the SQLite-only version of this design, this can no longer be one local transaction spanning case + contacts — see §7.

### 4.5 Frontend
- `CaseDetailSidebar.tsx` — extend `CaseDetailTab` with `"contacts"`; add a `SidebarNavButton` directly below Calendar, per the issue's placement instruction.
- `CaseManagementOpenCases/CaseContactsPanel.tsx` (new) — case-scoped view: list contacts linked to the case (via `list_contacts_for_case`, always live from the backend), "Add existing" (search over `list_contacts`, which itself already returns only what the current user can see — own contacts, contacts shared with them, or the whole flat pool), inline "New contact" form, per-row unlink (`remove_contact_from_case` — local unlink only, never deletes the backend contact). Any row with `canEdit === true` (owner or share recipient) is editable inline. Only rows with `ownedByMe === true` additionally show "Share"/"Manage sharing" (§4.6) — a recipient can edit fields but never delete, share, or unshare. Modeled on `CaseTasksPanel.tsx`'s structure.
- `useContactList` hook (new, mirrors `useTaskList`) — load/create/link/unlink/share/unshare state management.
- `CaseManagementCaseCreateForm.tsx` — a client-email input, wired through `case-create.reducer.ts` (`SET_CONTACT_EMAILS`) into `create_new_case`'s new parameter.
- `CaseManagementOpenCasesDetails.tsx` — add the `"contacts"` branch to both the header-title and panel-body ternaries.
- `locales/en.json` / `locales/he.json` — `"contacts"` plus panel copy (Add existing, New contact, Share, Manage sharing, Unshare, Remove from case), synced manually per existing convention.

### 4.6 Sharing UI
"Share" on an owned contact row opens a same-firm member picker. Reuses the existing `list_org_members` Tauri command/backend route (already used for team invites, already firm-scoped) rather than building a new user-search endpoint — the recipient list is exactly "members of my firm," which `list_org_members` already returns. Selecting a recipient calls `share_contact(contact_id, recipient_user_id)`. The owner also gets a small "shared with: [names]" list per contact with a per-recipient "unshare" (`unshare_contact`) — this is necessary now that sharing is revocable rather than a one-shot copy. For a `flat` actor, sharing is not offered in the UI at all — the pool is already global, so there is no one left to share *to* that doesn't already see it.

### 4.7 Google Contacts (plan.md Phase 5)
Structurally unaffected by the backend-storage decision — imported contacts are just another `create_contact` call with `source='google'` and `googleContactId` set, subject to the same ownership rules as any other contact the importing user creates.
- OAuth: either (a) extend `calendar/oauth.rs`'s `GOOGLE_CALENDAR_SCOPE` to also request `https://www.googleapis.com/auth/contacts.readonly`, or (b) a fully parallel `contact/google_oauth.rs` + `google_contacts_accounts` table. **Open question — needs a decision before that phase starts** (see §8).
- `contact/google_people.rs` (new) — `list_google_contacts()` hitting `people.googleapis.com/v1/people/me/connections`, reusing `get_valid_access_token()`.
- Frontend picker — modal listing fetched contacts; "Add selected" calls `create_contact` per selection, then `add_contact_to_case`.

## 5. Ownership, visibility, and sharing model

This is the core design decision for the feature and the reason contacts don't need any team/firm-role logic at all, despite `apps/backend` having a four-role (`admin`/`manager`/`user`/`flat`) system with teams.

- **Flat accounts** (`accountType = 'flat'`, no firm): one global pool. Every flat-sourced contact is visible to and usable by every flat user, unconditionally — `listVisibleContacts` for a flat actor is simply "all rows where `accountType = 'flat'`," no ownership filter, no `contact_shares` involvement. No explicit share action exists or is needed.
- **Firm accounts** (`admin`/`manager`/`user`): contacts are **private to the creating user** by default — `listVisibleContacts` is:
  ```sql
  SELECT * FROM contacts WHERE user_id = :actorId
  UNION
  SELECT c.* FROM contacts c
    JOIN contact_shares s ON s.contact_id = c.id
    JOIN users owner ON owner.id = c.user_id
    JOIN users recipient ON recipient.id = s.shared_with_user_id
   WHERE s.shared_with_user_id = :actorId
     AND owner.firm_id = recipient.firm_id   -- re-checked live, not just at share time
  ```
  The `owner.firm_id = recipient.firm_id` re-check matters: if either the sharer or the recipient later changes firms, the share silently stops granting access on the very next read — no explicit revoke needed for that case, and the app's "no cross-firm data, ever" guarantee holds even for data one user voluntarily handed to another.
- **Sharing** (firm accounts only): a user may call `shareContact(contactId, recipientUserId)`, which:
  1. Loads the contact, verifies `actor.id === contact.userId` (only the owner can share; a share does not grant re-share rights).
  2. Loads the recipient's `firmId`, verifies `recipient.firmId === actor.firmId` (same firm only — the one hard rule from the issue's requirements; this is the sole place a firm/role check happens anywhere in this feature).
  3. Inserts a row into `contact_shares` (`contactId`, `sharedWithUserId = recipientUserId`, `sharedByUserId = actor.id`). No contact data is copied.
  4. Returns the contact as the recipient will now see it. From then on, any edit — by the owner or by any current recipient — is visible to everyone with access immediately (same row); deleting the contact or calling `unshareContact` revokes access immediately.
- **Edit is shared, delete/share/unshare are owner-only.** `updateContact` allows anyone who currently has visibility into the contact (owner or a live-share recipient, same check as `listVisibleContacts`) to edit it — this is deliberately a collaborative "shared address book entry," not owner-gated. `deleteContact`/`shareContact`/`unshareContact` still require `actor.id === contact.userId` exactly — a recipient can update the contact's phone number, but can't delete it, grant it to someone else, or revoke anyone else's access. This split is enforced in `lib/contacts/crud.ts`, not just the UI (§4.5's `ownedByMe` flag gates delete/share/unshare display only, per this repo's established convention of client checks being advisory, server checks being authoritative; edit visibility instead follows a broader `canEdit` flag — see §6).
- **No conflict resolution.** There is no version/optimistic-locking field — if two people with access edit around the same time, it's silent last-write-wins. Accepted given the small number of fields and low expected edit frequency; `updatedByUserId` (§3.1) at least tells you who made the last change, even without preventing a lost update.

**Rejected: team-scoped visibility.** Earlier design passes considered scoping contacts by team (a manager's team sharing a pool, visibility computed via a BFS-style traversal like the existing `getVisibleMemberUserIds` uses for the member roster). Rejected because:
1. **Cases have no team.** Nothing links a case to a team today (cases aren't even firm-scoped), so "scope the contact to the case's team" has nothing to inherit from — a team would have to be picked disconnected from the case it's actually for.
2. **Team membership is many-to-many**, and a manager can own multiple teams while also being a member of another manager's team — "my team's contacts" isn't a single filterable set, it's the same recursive-reachability problem the member roster already has, freshly built for a second entity.
3. **The automatic sources can't pick a team.** Email-approval has no human present to ask, and `admin` isn't a member of any team by this data model at all.

Per-user ownership with explicit, same-firm-only sharing sidesteps all three: no case→team dependency, no reachability computation, and the automatic sources (email, case-creation) always have an unambiguous owner — whichever user triggered them.

## 6. Key interfaces

**Backend routes** (`apps/backend/app/api/v1/contacts/desktop/`):
```
POST /list                                  { token }                                    -> Contact[]
POST /                                      { token, name?, email, phone?, organization? }    -> Contact
POST /update                                { token, id, name?, phone?, organization? }        -> Contact
POST /delete                                { token, id }                                 -> {}
POST /share                                 { token, contactId, recipientUserId }         -> Contact
POST /unshare                               { token, contactId, recipientUserId }         -> {}
POST /by-ids                                { token, ids: string[] }                      -> Contact[]
```

**Rust Tauri commands** (`apps/desktop/src-tauri/src/contact/mod.rs`):
```rust
list_contacts(app: AppHandle) -> Result<Vec<Contact>, String>                                  // -> POST /list
create_contact(app: AppHandle, name: Option<String>, email: String, phone: Option<String>, organization: Option<String>) -> Result<Contact, String>
update_contact(app: AppHandle, id: String, name: Option<String>, phone: Option<String>, organization: Option<String>) -> Result<Contact, String>
delete_contact(app: AppHandle, id: String) -> Result<(), String>
share_contact(app: AppHandle, contact_id: String, recipient_user_id: String) -> Result<Contact, String>
unshare_contact(app: AppHandle, contact_id: String, recipient_user_id: String) -> Result<(), String>

list_contacts_for_case(app: AppHandle, case_id: i64) -> Result<Vec<Contact>, String>            // local ids -> POST /by-ids
add_contact_to_case(app: AppHandle, case_id: i64, backend_contact_id: String) -> Result<(), String>  // local only
remove_contact_from_case(app: AppHandle, case_id: i64, backend_contact_id: String) -> Result<(), String>  // local only

// Phase 2
list_google_contacts(app: AppHandle) -> Result<Vec<GoogleContact>, String>
```

```ts
interface Contact {
  id: string; // uuid
  name: string | null;
  email: string;
  phone: string | null;
  organization: string | null;
  source: "manual" | "email" | "case_creation" | "google";
  ownedByMe: boolean;       // false = shared with me; drives delete/share/unshare visibility client-side
  canEdit: boolean;         // true for the owner and any current share recipient; drives edit-field visibility
  updatedByUserId: string | null;  // attribution for the last edit, whoever made it
  sharedWith?: string[];    // owner's view only: user ids this contact is currently shared with
  createdAt: string;
  updatedAt: string;
}
```

## 7. Offline / degraded-mode behavior

This is new territory: every prior local-only design in this app degrades gracefully with no network (that's the whole point of local-first SQLite). Moving contact storage to the backend means **contact operations now require connectivity**, and there is no existing sync/queue infrastructure anywhere in this codebase to fall back on (confirmed — no outbox table, no dirty-flag pattern, no background reconciliation job exists today).

Concretely:
- **Email approval** (`confirm_email_alert`) must remain fully local-operation-safe. If the backend call to create/link a contact fails (network down, backend unreachable, token expired), the email confirmation itself must still succeed — the contact-creation call is wrapped exactly like today's best-effort `learn_from_confirmed_email` call, logged and swallowed, not surfaced as a failure. The practical consequence: **a sender approved while offline never becomes a contact**, silently, with no retry. Acceptable for a first version given no sync infrastructure exists to build a retry queue on top of; worth flagging to product as a known gap.
- **Case creation with `contact_emails`** can no longer be one local transaction. The case itself is created locally regardless of backend reachability (case creation must not start requiring network — that would be a real regression). Contact creation/linking for the supplied emails is attempted after, best-effort per email; a partial failure (case created, 1 of 2 contacts failed to link) is surfaced to the user as a non-blocking warning rather than rolling back the case.
- **Manual "Add existing" / "New contact" from the Contacts panel** can simply show a network error and let the user retry — these are explicit, foreground user actions, not background/automatic ones, so failing loudly and letting the user retry is the right (and simplest) behavior; no special handling needed.

## 8. Open questions / risks

- **Google OAuth scope strategy (§4.7)** — extend existing Calendar scope vs. a separate Contacts connect flow. Needs a decision before the Google Contacts phase (plan.md Phase 5) starts.
- **Name parsing for email-derived contacts** — `alert.sender` may be a bare address or a `"Display Name <addr>"` header value; needs a small parser (or reuse of whatever `crate::email::parse_sender` already extracts) to populate `name` rather than leaving it null for every email-sourced contact.
- **Case-creation email field UX** — no existing multi-email chip input was found in `packages/ui`; confirm whether to build one or keep it a simple delimited text field given the single-call-site rule in this repo's coding standards.
- **`list_contacts_for_case` partial-visibility edge case**: a case can link to a `backend_contact_id` the current viewer can no longer see — either because they never had access (two firm members both have the same case folder indexed locally, one links a private contact) or because access was revoked since (owner called `unshare_contact`, or the owner/recipient changed firms — §5's live re-check). `by-ids` filters server-side to what the caller can currently see, so the panel simply shows fewer contacts than are actually linked, with no error. Acceptable given cases aren't a collaborative/synced concept in this app today, but worth being explicit that this is the resulting behavior rather than a bug — the local `case_contacts` link row itself is never cleaned up when this happens, it just stops resolving to anything visible.
