# Adding People to a Meeting — Design

Design for [ASC-177](https://linear.app/amicusx/issue/ASC-177/adding-people-to-a-meeting):

1. When creating or editing a meeting, it should be possible to add more people (attendees) to it.
2. When people are added directly in Google Calendar, that should reflect back into the Ascurix UI.

Extends [`design.md`](./design.md) (ASC-163's base Calendar design) — assumes the existing OAuth flow, sync poller, `meetings` SQLite table, and write-through `create_meeting`/`update_meeting` commands described there. Nothing here touches `apps/backend`'s separate `meetings` Postgres table (ASC-183, web portal) — that feature has no Google Calendar connection at all (its own code comment: *"Google Calendar OAuth connection and two-way sync... are NOT implemented here"*), so requirement 2 above has no meaning there; this design is scoped entirely to the desktop app.

---

## 1. Goals and non-goals

**Goals**

1. `MeetingForm` (create + edit) gets an attendees field: add people by email, either typed manually or picked from the user's Google Contacts (reusing the existing contacts-import UI pattern).
2. `create_meeting`/`update_meeting` write attendees through to Google Calendar's `events.insert`/`events.patch`, same write-through-then-mirror model as every other field.
3. The sync poller (`calendar/sync.rs`) reads `attendees[]` off every synced Google event and mirrors it locally — an attendee added directly in Google Calendar (not through Ascurix) shows up in the Ascurix UI on the next sync tick, with no code path that only works for in-app changes.
4. Attendees are visible (read-only list, name + email + RSVP status if known) on the meeting box / meeting detail wherever a meeting is already rendered.

**Non-goals**

- RSVP management from Ascurix — no "resend invite," no changing someone's response status from the app. `responseStatus` is stored and displayed as Google reports it, never written by Ascurix.
- Custom invitation email text — Google's own invite email is used as-is.
- Any distinction between "an Ascurix user" and "an arbitrary email" as an attendee — an attendee is just an email + optional display name, same shape Google itself uses; no linkage to `contacts`/`case_contacts`.
- Free-busy / availability lookups when picking attendees.
- The `apps/backend` web portal's local-only `meetings` table (ASC-183) — out of scope, see above.

## 2. What exists vs. what's missing

| Capability | Status | Location |
|---|---|---|
| `meetings` table, write-through `create_meeting`/`update_meeting`, sync poller | ✅ | `store/mod.rs`, `calendar/mod.rs`, `calendar/sync.rs` (ASC-163) |
| OAuth scope already includes full read/write `calendar` (not `calendar.readonly`) | ✅ | `calendar/oauth.rs:24` — no new consent needed to push attendees |
| Multi-select checkbox picker over Google Contacts (search, `Set<string>` selection, "N selected" counter) | ✅ (reusable pattern) | `components/CaseManagement/CaseManagementOpenCases/GoogleContactsImportDialog.tsx`, backed by existing `list_google_contacts` command |
| `attendees` on `EventInput`/`GoogleEvent`, sent/parsed against Google's API | ❌ | new, §4 |
| `meeting_attendees` table + accessors | ❌ | new, §3 |
| `attendees` param on `create_meeting`/`update_meeting`, attendee mirroring in `apply_synced_event` | ❌ | new, §5/§6 |
| Attendees section in `MeetingForm.tsx`, `Attendee` type, `MeetingFormValues.attendees` | ❌ | new, §7 |

## 3. Data model

One new child table in `store/mod.rs`, alongside `CALENDAR_SCHEMA` — a meeting can have any number of attendees, so this is a separate table rather than a column, following the same FK/index conventions as `meetings` itself:

```sql
CREATE TABLE IF NOT EXISTS meeting_attendees (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id       INTEGER NOT NULL,
    email            TEXT    NOT NULL,
    display_name     TEXT,
    response_status  TEXT    NOT NULL DEFAULT 'needsAction'
                             CHECK (response_status IN ('needsAction','accepted','declined','tentative')),
    created_at       TEXT    NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting_id ON meeting_attendees(meeting_id);
```

- `response_status` values mirror Google's own `attendees[].responseStatus` enum exactly, so no translation layer is needed between the Google API shape and the stored shape.
- Whole-set replace, not per-row diffing: every write (manual create/update, or a sync tick) calls a single `replace_meeting_attendees(conn, meeting_id, &[AttendeeInput])` that does `DELETE FROM meeting_attendees WHERE meeting_id = ?1` followed by a batch `INSERT`, inside the same flow as `upsert_meeting`/`update_meeting_row`. This avoids diffing add/remove/rsvp-changed individually — attendee lists are small (a handful of people), so a full replace on every write is cheap and keeps the logic identical for both the manual-write and sync-mirror paths.
- `MeetingRow` (the struct every command already returns) gains `pub attendees: Vec<AttendeeRow>`, populated by a helper that queries `meeting_attendees` and attaches the result after `meeting_row_from_sql` — called from `get_meeting`, `get_meeting_by_google_event_id`, `list_meetings_for_range`, `list_meetings_for_case`. This keeps `MeetingRow` a single self-contained payload for the frontend rather than requiring a second `list_meeting_attendees` round-trip per meeting.

## 4. Google Calendar API

`calendar/google_events.rs`:

```rust
pub struct AttendeeInput<'a> {
    pub email: &'a str,
    pub display_name: Option<&'a str>,
}

pub struct EventInput<'a> {
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub location: Option<&'a str>,
    pub start_time: &'a str,
    pub end_time: &'a str,
    pub attendees: &'a [AttendeeInput<'a>],   // new
}

#[derive(Debug, Clone, Deserialize)]
pub struct GoogleEventAttendee {
    pub email: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(rename = "responseStatus")]
    pub response_status: Option<String>,
}

pub struct GoogleEvent {
    // ...existing fields...
    #[serde(default)]
    pub attendees: Vec<GoogleEventAttendee>,   // new
}
```

`event_body()` adds an `"attendees"` array (`[{ "email": ..., "displayName": ... }, ...]`) when non-empty.

**Invite emails**: `insert_event`/`patch_event` add `?sendUpdates=all` to the request URL. Without it, Google's default (`sendUpdates=none`) creates/patches the event but never emails the people being added — silently defeating the point of this feature, since "adding people to a meeting" implies they actually get notified. `sendUpdates=all` is scoped to attendee-visible changes generally (Google doesn't let you opt in per-field), which is an acceptable, expected side effect: editing a meeting's time/location already ought to notify attendees too.

## 5. `create_meeting` / `update_meeting` commands

`calendar/mod.rs`:

- Both commands gain an `attendees: Vec<AttendeeInputDto>` parameter (`{ email: String, display_name: Option<String> }`, `#[derive(Deserialize)]`, the Tauri-boundary counterpart of `AttendeeInput`).
- Passed into `google_events::EventInput.attendees` before the `insert_event`/`patch_event` call.
- After the Google write-through succeeds (same ordering as everything else in `create_meeting`/`update_meeting` — Google first, local mirror only on success), call `store::replace_meeting_attendees(&conn, meeting_id, &attendees)`.
- Empty `attendees: []` is a legal, common case (most meetings today have none) — no validation beyond what Google itself rejects (a malformed email).

## 6. Sync engine — reflecting Google-side changes (requirement 2)

`apply_synced_event` (`calendar/sync.rs`) is the single place every synced Google event already flows through, so it's the natural (and only) hook needed for "attendees added in Google Calendar show up in the UI" — no new poller, no new command:

```rust
fn apply_synced_event(conn: &rusqlite::Connection, event: &google_events::GoogleEvent) -> Result<(), String> {
    // ...existing cancelled/upsert_meeting logic unchanged...

    let meeting = store::upsert_meeting(conn, store::UpsertMeetingInput { /* ...unchanged... */ })
        .map_err(|e| e.to_string())?;

    let attendees: Vec<store::AttendeeInput> = event.attendees.iter()
        .map(|a| store::AttendeeInput {
            email: &a.email,
            display_name: a.display_name.as_deref(),
            response_status: a.response_status.as_deref().unwrap_or("needsAction"),
        })
        .collect();
    store::replace_meeting_attendees(conn, meeting.id, &attendees).map_err(|e| e.to_string())?;

    Ok(())
}
```

Because this runs on *every* synced event (not just newly-created ones), an attendee added to an existing meeting directly in Google Calendar is picked up on the next sync tick (≤60s later, per the existing `CALENDAR_SYNC_INTERVAL`) exactly the same way an out-of-band title/time edit already is — no special-casing needed for attendees specifically.

## 7. Frontend

- **`lib/calendar/types.ts`**: new `Attendee { email: string; display_name: string | null; response_status: "needsAction" | "accepted" | "declined" | "tentative" }`; `Meeting` gains `attendees: Attendee[]`.
- **`hooks/useMeetingList.ts`**: `MeetingFormValues` gains `attendees: { email: string; displayName?: string }[]`; `createMeeting`/`updateMeeting` pass it straight through to `invoke("create_meeting"/"update_meeting", { ..., attendees })`.
- **`components/Calendar/MeetingForm.tsx`**: new attendees section between location and case picker:
  - A compact list of currently-added attendees (email/name chip, remove button).
  - "Add from Google Contacts" opens a picker adapted from `GoogleContactsImportDialog.tsx`'s multi-select-checkbox pattern (search filter, `Set<string>` selection, "N selected" counter, backed by the existing `list_google_contacts` command) — confirmed reusable UI shape, not a new component built from scratch.
  - A manual "add by email" text input alongside it, for anyone not in the user's Google Contacts (validated as a well-formed email client-side; Google itself is the final authority).
  - In edit mode, seeded from `initialMeeting.attendees`.
- New i18n keys in `en.json`/`he.json`, following the existing flat-key convention next to `calendar_field_*`: `calendar_field_attendees`, `calendar_attendees_add_by_email_placeholder`, `calendar_attendees_add_from_contacts`, `calendar_attendees_remove`, `calendar_attendees_none`.

## 8. Error handling

- Same as the base design's §13: a Google API rejection (e.g. malformed attendee email) surfaces the error string to the frontend as-is; nothing is written locally, consistent with "no local meeting/attendee that doesn't exist in Google."
- A sync tick that fails is logged and retried next tick (existing behavior) — attendee mirroring shares the same failure path as the rest of `apply_synced_event`, no separate error handling needed.

## 9. Testing strategy (80/20)

- **Rust unit**: `replace_meeting_attendees` (empty→non-empty, non-empty→different set, non-empty→empty; cascade delete when the parent meeting is deleted).
- **Rust integration** (extends the existing `tests/calendar/` sync tests): a mocked `events.list` response whose event carries `attendees[]` that differ from what's already stored locally — asserts the local `meeting_attendees` rows end up matching Google's list exactly (add, remove, and RSVP-status-changed cases).
- **Frontend**: `MeetingForm` attendee add/remove interactions and that `onSave` includes the current attendee list.
- Not covered (per 80/20, matching the base design's stance): actual Google invite-email delivery/formatting (manual QA), RSVP webhook-style real-time updates (there are none — polling only, per ASC-163 §1 non-goals).

## 10. Open risks

- **`sendUpdates=all` on every edit, not just attendee changes** — a title/time/location-only edit will also (re-)email existing attendees, since Google's API has no finer-grained "only notify if attendees changed" option. Considered acceptable (attendees generally *should* be told when a meeting they're in changes at all) but worth confirming isn't surprising in practice once this ships.
- **No removal-conflict handling** — if a meeting's attendee list is edited concurrently in both Ascurix and Google Calendar between sync ticks, the next successful write from either side simply overwrites the other's version (whole-set replace, §3) — same last-write-wins semantics the base design already accepts for every other meeting field, not a new risk this introduces, but worth naming explicitly since attendees are more likely to be edited from multiple places than a title is.
