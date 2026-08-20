# Contacts — Implementation Plan

Linear: [ASC-109](https://linear.app/amicusx/issue/ASC-109/add-contacts-to-a-case) · Branch: `tsemachmizrachi/asc-109-add-contacts-to-a-case`

See [`design.md`](./design.md) for the data model, ownership/sharing rationale, and interfaces this plan implements.

## Phase overview

- **Phase 1 — Backend contacts foundation.** Postgres table, auth, CRUD/share logic, API routes. No desktop-visible behavior yet.
- **Phase 2 — Desktop Rust client + local link table.** HTTP command layer, local `case_contacts` table.
- **Phase 3 — Automatic sources.** Email-approval and case-creation hooks, with offline-safe handling.
- **Phase 4 — Frontend.** Case tab, panel, sharing UI, case-creation form field.
- **Phase 5 — Google Contacts source.** Separable, depends on an OAuth-scope decision.

## Phase 1 — Backend contacts foundation

### 1. Schema — `packages/backend-orm/src/schema.ts`
- Add the `contacts` table per `design.md` §3.1: `id (uuid)`, `userId`, `accountType`, `name`, `email`, `emailNorm`, `phone`, `organization`, `source`, `googleContactId`, `createdAt`, `updatedAt`, `updatedByUserId`.
- Add the `contact_shares` table per `design.md` §3.1: composite PK `(contactId, sharedWithUserId)`, `sharedByUserId`, `sharedAt`, both FKs `onDelete: cascade`.
- Add the two partial unique indexes (`contacts_email_flat_uniq` on `emailNorm` where `accountType='flat'`; `contacts_email_firm_uniq` on `(userId, emailNorm)` where `accountType='firm'`).
- Run the Drizzle migration (`pnpm --filter backend db:generate` / `db:push`, per this repo's existing workflow for schema changes).

### 2. Authorization — `apps/backend/lib/contacts/auth.ts` (new)
- Thin wrapper resolving `token` → `Actor { id, accountType, firmId }` via the existing `authorizeDesktopToken`. `accountType` derives from `role === 'flat' ? 'flat' : 'firm'`.

### 3. CRUD/share logic — `apps/backend/lib/contacts/crud.ts` (new)
- `listVisibleContacts(actor)` — implements the owned-`UNION`-shared-with-live-firm-check query from `design.md` §5.
- `createContact(actor, fields)`.
- `updateContact(actor, id, fields)` — **edit is not owner-gated**: allowed for the owner or any current live-share recipient (same visibility check as `listVisibleContacts`, per `design.md` §5). Sets `updatedByUserId = actor.id` on every write.
- `deleteContact(actor, id)` — owner-only (`WHERE userId = actor.id`); cascades `contact_shares`.
- `shareContact(actor, contactId, recipientUserId)` — owner-only; the three-step check in `design.md` §5 (must own, recipient must be same firm, insert a `contact_shares` row — no contact data copied). Return a clear 403 message for a cross-firm share attempt (mirroring the existing `canInvite`/`canChangeRole` error-message style in `lib/permissions.ts`).
- `unshareContact(actor, contactId, recipientUserId)` — owner-only, deletes the `contact_shares` row.
- `getContactsByIds(actor, ids)` — authorization-filtered batch fetch, used by the desktop's `list_contacts_for_case`.
- Email normalization helper (lowercase/trim) shared between create/update paths.

### 4. API routes — `apps/backend/app/api/v1/contacts/desktop/`
- `route.ts` (GET/POST list+create), `update/route.ts`, `delete/route.ts`, `share/route.ts`, `unshare/route.ts`, `by-ids/route.ts` — each follows `org/desktop/members/route.ts`'s idiom exactly: `token` from body → `authorizeDesktopToken` (via `lib/contacts/auth.ts`) → 401 on failure → call the matching `lib/contacts/crud.ts` function → `NextResponse.json(...)`.

### Phase 1 exit criteria
- `POST /api/v1/contacts/desktop` create/list/update/delete/share/unshare/by-ids all work against a real Postgres instance, independently testable via `curl`/Postman with a valid desktop session token, before any Rust/frontend work starts.
- A flat-account token sees the full flat pool; a firm-account token sees only their own contacts plus anything currently shared with them; a cross-firm share attempt returns 403.
- Editing an owned contact is immediately visible to a recipient it's shared with (same row, verified via two tokens in a test), and a recipient can edit it back — with `updatedByUserId` reflecting whoever made the most recent change. A recipient's attempt to delete, share, or unshare the contact returns 403. Unsharing (or the owner/recipient changing firms) removes it from the recipient's `listVisibleContacts` result on the next call.
- Duplicate-email create for the same owner/pool upserts rather than erroring (partial unique index verified with a direct-insert test).

## Phase 2 — Desktop Rust client + local link table

### 5. Local schema — `apps/desktop/src-tauri/src/contact/schema.rs` (new)
- `case_contacts` table only, per `design.md` §3.2 — no contact-field columns.
- Wire `init_contact_schema(&conn)` into `open_db_by_path` in `store/mod.rs`, alongside `matcher_schema::init_matcher_schema` (~line 502).
- Unit tests mirroring `matcher_schema.rs`: table/index creation, idempotency, cascade-on-case-delete.

### 6. HTTP client + commands — `apps/desktop/src-tauri/src/contact/mod.rs` (new)
- `call_contacts_desktop(app, path, body)` helper, cloned from `org/mod.rs::call_org_desktop`.
- Backend-calling commands: `list_contacts`, `create_contact`, `update_contact`, `delete_contact`, `share_contact`, `unshare_contact`.
- Local-only commands: `add_contact_to_case`, `remove_contact_from_case` (`case_contacts` insert/delete, no HTTP).
- Hybrid command: `list_contacts_for_case` — read local `case_contacts.backend_contact_id`s for the case, then call `by-ids`.
- `create_contact`/`update_contact` additionally write the organization-suggestion tag locally on success, per `design.md` §4.2a — reuse `tags::add_tag`'s internal write function directly (find and call whatever `apps/desktop/src-tauri/src/tags/mod.rs::add_tag` delegates to) with `scope_type='app'`, `name='organization'`, `value=<organization>`, `type='user'`, only when `organization` is non-empty. Best-effort — log and swallow, never fail the contact write over this.
- Register all seven in `lib.rs`'s `generate_handler![]`, next to `org::*`/`case::*`.
- Tests: mock the backend HTTP layer (same approach `org/mod.rs`'s existing tests use, if any — otherwise a minimal `mockito`/wiremock-style stub) for the backend-calling commands; a real-SQLite integration test for the local-only commands and for the organization-tag side effect (`list_tag_values("organization")` includes a value after `create_contact` with that organization).

### Phase 2 exit criteria
- Every command in `design.md` §6 is callable from the frontend via `invoke()` and round-trips correctly against a locally running `apps/backend` dev server.
- `list_contacts_for_case` correctly drops any linked contact the current session can no longer see (per `design.md` §8's partial-visibility note) without erroring.
- Creating a contact with an organization value makes that value appear in `CaseManagementOrganizationField`'s autocomplete on the next case-creation form open, with no other change needed to that existing component.

## Phase 3 — Automatic sources (email approval, case creation)

### 7. Email-approval hook — `apps/desktop/src-tauri/src/case/identifiers.rs`
- Extend `learn_from_confirmed_email` to also call `contact::create_contact` for `alert.sender` and insert a local `case_contacts` row (`source='email'`) on success.
- Resolve the name-parsing open question from `design.md` §8 here (check `crate::email::parse_sender` for a display name; add minimal `"Name <addr>"` parsing if not).
- Wrap the whole addition in the same best-effort pattern as the existing call at `emails_alerts.rs:369` — log and swallow any error (network or otherwise), per `design.md` §7. This is the one hook where the offline-safety requirement is non-negotiable: email confirmation must never fail because the backend was unreachable.
- Test: approving an email from a new sender creates a contact + link when the backend is reachable; approving while the backend call is mocked to fail still completes the email confirmation successfully (this is the test that matters most in this phase).

### 8. Case-creation hook — `apps/desktop/src-tauri/src/case/mod.rs`
- Add `contact_emails: Vec<String>` (default empty) to `create_new_case`.
- Case creation itself proceeds and returns success regardless of contact-linking outcome (per `design.md` §7 — no rollback on partial contact failure). For each email: create/link, collecting any failures into a non-fatal warnings list returned alongside the created case.
- Test: creating a case with 2 valid emails links both; creating with the backend unreachable still creates the case and reports 2 warnings, not a hard failure.

### Phase 3 exit criteria
- Both automatic sources tested against a live and a failing backend, confirming the offline-safety behavior in `design.md` §7 holds in both hooks.

## Phase 4 — Frontend

### 9. Case-creation frontend
- `case-create.reducer.ts` — add `SET_CONTACT_EMAILS` action + state field, following the existing `SET_CASE_TYPE` pattern.
- `CaseManagementCaseCreateForm.tsx` — add a "Client Email(s)" field (props threaded like `organization`/`caseType`). Confirm whether a reusable multi-value input exists in `packages/ui`; otherwise a simple delimited text input is sufficient for this one call site.
- `CaseManagementCaseCreate.tsx` — pass `contactEmails` to `create_new_case`; surface any returned warnings (per Phase 3 item 8) as a non-blocking toast/notice rather than blocking case creation.

### 10. Case-detail tab wiring
- `CaseDetailSidebar.tsx` — add `"contacts"` to `CaseDetailTab`; add a `SidebarNavButton` below Calendar, before the existing divider.
- `CaseManagementOpenCasesDetails.tsx` — add `activeRightTab === "contacts"` to the header-title and body ternaries, rendering `<CaseContactsPanel caseId={...} />`.

### 11. `useContactList` hook — `apps/desktop/src/hooks/useContactList.ts` (new)
- Mirrors `useTaskList`'s shape: load (`list_contacts_for_case`, `list_contacts` for the "add existing" search), create-and-link, link-existing, unlink, share, unshare, error/loading state.

### 12. `CaseContactsPanel.tsx` — `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/` (new)
- Modeled on `CaseTasksPanel.tsx`: list of linked contacts, "Add existing" (search over `list_contacts`), inline "New contact" form, per-row unlink (`remove_contact_from_case` — local unlink only). Any row with `canEdit === true` (owner or share recipient) is editable inline via `update_contact`. Only rows with `ownedByMe === true` additionally show "Share" and "Manage sharing" (§13).
- For a `flat` session, hide the "Share" action entirely (per `design.md` §4.6 — nothing to share to that isn't already visible).

### 13. Sharing UI
- Reuse the existing `list_org_members` command/route as the same-firm recipient picker (no new user-search endpoint).
- "Share" → picker → `share_contact(contact_id, recipient_user_id)` → success toast. The recipient sees the *same* contact (via `contact_shares`), not a copy — editing it afterward updates what the recipient sees too.
- "Manage sharing" on an owned contact lists current recipients (`sharedWith`) with a per-row "Unshare" (`unshare_contact`) — revokes access immediately.

### 14. i18n
- `locales/en.json` / `locales/he.json` — `"contacts"` at the position matching other case-tab keys, plus labels for Add existing / New contact / Share / Unshare / Remove from case / form placeholders. Synced manually per existing convention.

### Phase 4 exit criteria
- A firm user can create a contact, see it privately, share it with a same-firm colleague, and the colleague sees it in their own list (manually verified — no realtime push exists or is in scope; a manual refresh is expected).
- The colleague can edit the contact inline; the edit is visible to the owner on their next refresh, with the panel/attribution reflecting the colleague as the last editor. The colleague cannot delete, share, or unshare it — those controls aren't rendered for a non-owned row, and the backend rejects them regardless.
- Unsharing removes it from the colleague's list on their next refresh.
- A flat user sees the shared global pool and no "Share"/"Manage sharing" affordance.
- `npx tsc --noEmit` passes.

## Phase 5 — Google Contacts source

Blocked on resolving the OAuth-scope question in `design.md` §8 (extend `calendar/oauth.rs`'s scope vs. a parallel `contact/google_oauth.rs` flow) before starting.

### 15. OAuth
- If extending: add `contacts.readonly` to `GOOGLE_CALENDAR_SCOPE` in `calendar/oauth.rs`; no new account table needed.
- If parallel: `contact/google_oauth.rs` cloned from `calendar/oauth.rs`, new `google_contacts_accounts` table (mirrors `google_calendar_accounts`, `store/mod.rs:1072-1080`).

### 16. People API fetch — `apps/desktop/src-tauri/src/contact/google_people.rs` (new)
- `list_google_contacts()`, `GET people.googleapis.com/v1/people/me/connections`, reusing `get_valid_access_token()`.

### 17. Frontend picker
- Modal listing fetched contacts with checkboxes; "Add selected" → `create_contact` per selection (`source='google'`, stores `googleContactId`) → `add_contact_to_case`.
- Entry point placement (bundled into the existing Calendar connect UI vs. its own) follows whichever OAuth-scope option is chosen in step 15.

### Phase 5 exit criteria
- A connected Google account's contacts can be browsed and selectively imported onto a case.
- Re-importing an already-imported Google contact upserts rather than duplicating (partial unique index holds).
- Token refresh reuses `get_valid_access_token()` without new refresh logic.

## Testing notes

Per this repo's 80/20 rule: cover the main flow (create/list/update/delete/share, each of the three Phase-3/4 automatic+manual sources, offline-safety of the two automatic hooks) and one basic failure case per hook. The offline-safety tests in Phase 3 are the highest-value tests in this plan — they're the one behavior that's genuinely new for this app (every other feature degrades locally; this one has a real network dependency for the first time) — so don't skip them even under the 80/20 rule's "don't aim for exhaustive coverage" guidance.
