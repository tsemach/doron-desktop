//! Background mirror of Google Calendar into the local `meetings` table.
//! Polling with `syncToken` incremental sync (design.md §5, brainstorm.md
//! §9) -- a desktop app can't host a public webhook endpoint for Google's
//! push notifications, so polling is the only realistic transport, but
//! there's no reason to pay for a full refetch every tick once a sync token
//! exists.

use tauri::AppHandle;

use super::{case_link, google_events, oauth};
use crate::store;

pub const CALENDAR_SYNC_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

/// Mirrors email::poll_emails_background's shape exactly, including the
/// missed-tick behavior -- see that function for why `Delay` (not `Burst`)
/// matters here too: a laptop waking from sleep shouldn't fire a storm of
/// catch-up syncs.
pub async fn poll_calendar_background(app: AppHandle) {
    let mut interval = tokio::time::interval(CALENDAR_SYNC_INTERVAL);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        interval.tick().await;
        if oauth::read_google_calendar_account_internal(&app).ok().flatten().is_none() {
            continue;
        }
        if let Err(e) = sync_once(&app).await {
            println!("[Calendar Sync Error] {e}");
        }
    }
}

/// One full incremental sync: pages through events.list until Google stops
/// returning a nextPageToken, upserting each event locally, then persists
/// whatever nextSyncToken the last page carried. A 410 Gone (expired token)
/// clears the stored sync_token so the *next* tick runs as a full resync
/// instead of erroring out indefinitely.
pub async fn sync_once(app: &AppHandle) -> Result<(), String> {
    let access_token = oauth::get_valid_access_token(app).await?;
    let account = oauth::read_google_calendar_account_internal(app)?.ok_or("Google Calendar is not connected")?;

    let client = reqwest::Client::new();
    let mut page_token: Option<String> = None;
    let mut next_sync_token: Option<String> = None;
    // Full resync (no stored sync_token) only looks back 30 days -- meetings
    // are forward-looking by nature, older history isn't worth the extra pages.
    let time_min = (chrono::Utc::now() - chrono::Duration::days(30)).to_rfc3339();

    loop {
        let page = google_events::list_events(&client, &access_token, account.sync_token.as_deref(), page_token.as_deref(), Some(&time_min)).await?;

        match page {
            google_events::ListEventsResult::SyncTokenExpired => {
                let mut cleared = account;
                cleared.sync_token = None;
                oauth::save_google_calendar_account_internal(app, &cleared)?;
                return Ok(());
            }
            google_events::ListEventsResult::Page { events, next_page_token, next_sync_token: page_sync_token } => {
                let conn = store::open_db(app)?;
                for event in &events {
                    apply_synced_event(&conn, event)?;
                }
                if page_sync_token.is_some() {
                    next_sync_token = page_sync_token;
                }
                match next_page_token {
                    Some(token) => page_token = Some(token),
                    None => break,
                }
            }
        }
    }

    if let Some(sync_token) = next_sync_token {
        let mut updated = account;
        updated.sync_token = Some(sync_token);
        oauth::save_google_calendar_account_internal(app, &updated)?;
    }
    Ok(())
}

/// A cancelled event's row is dropped; anything else is upserted, re-running
/// the case-link phrase match unless the existing row was linked by hand
/// (design.md §3/§5 -- a manual link must survive re-syncing the same event).
fn apply_synced_event(conn: &rusqlite::Connection, event: &google_events::GoogleEvent) -> Result<(), String> {
    if event.status == "cancelled" {
        return store::delete_meeting_by_google_event_id(conn, &event.id).map_err(|e| e.to_string());
    }

    let (Some(start), Some(end)) = (
        event.start.as_ref().and_then(|s| s.as_rfc3339()),
        event.end.as_ref().and_then(|e| e.as_rfc3339()),
    ) else {
        // Malformed event with no resolvable start/end -- skip rather than
        // insert a row that would violate the NOT NULL schema.
        return Ok(());
    };
    let title = event.summary.clone().unwrap_or_else(|| "(untitled)".to_string());
    let description = event.description.clone();

    let existing = store::get_meeting_by_google_event_id(conn, &event.id).map_err(|e| e.to_string())?;
    let (case_id, case_link_source) = match &existing {
        Some(existing) if existing.case_link_source == "manual" => (existing.case_id, existing.case_link_source.clone()),
        _ => case_link::resolve_case_link(conn, description.as_deref())?,
    };

    let meeting = store::upsert_meeting(
        conn,
        store::UpsertMeetingInput {
            google_event_id: &event.id,
            case_id,
            case_link_source: &case_link_source,
            title: &title,
            description: description.as_deref(),
            location: event.location.as_deref(),
            start_time: &start,
            end_time: &end,
            status: &event.status,
        },
    )
    .map_err(|e| e.to_string())?;

    // Every synced event (not just newly-created ones) runs through here, so
    // this is the one place that needs to exist for an attendee added
    // directly in Google Calendar to reach the local mirror -- no separate
    // code path for "attendees changed" (docs/calendar/
    // adding-people-to-meeting.md §6).
    let attendees: Vec<store::AttendeeInput> = event
        .attendees
        .iter()
        .map(|a| store::AttendeeInput {
            email: &a.email,
            display_name: a.display_name.as_deref(),
            response_status: a.response_status.as_deref().unwrap_or("needsAction"),
        })
        .collect();
    store::replace_meeting_attendees(conn, meeting.id, &attendees).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db(name: &str) -> rusqlite::Connection {
        let db_path = std::env::temp_dir().join(name);
        if db_path.exists() {
            let _ = std::fs::remove_file(&db_path);
        }
        store::open_db_by_path(&db_path).expect("should open full-schema test db")
    }

    fn confirmed_event(id: &str, attendees: Vec<google_events::GoogleEventAttendee>) -> google_events::GoogleEvent {
        google_events::GoogleEvent {
            id: id.to_string(),
            status: "confirmed".to_string(),
            summary: Some("Kickoff".to_string()),
            description: None,
            location: None,
            start: Some(google_events::GoogleEventDateTime { date_time: Some("2026-01-01T10:00:00Z".to_string()), date: None }),
            end: Some(google_events::GoogleEventDateTime { date_time: Some("2026-01-01T11:00:00Z".to_string()), date: None }),
            attendees,
        }
    }

    #[test]
    fn syncing_an_event_mirrors_its_attendees_locally() {
        let conn = test_db("sync_attendees_mirror_test.db");
        let event = confirmed_event(
            "evt-1",
            vec![google_events::GoogleEventAttendee {
                email: "a@example.com".to_string(),
                display_name: Some("Alice".to_string()),
                response_status: Some("accepted".to_string()),
            }],
        );

        apply_synced_event(&conn, &event).expect("apply_synced_event should succeed");

        let meeting = store::get_meeting_by_google_event_id(&conn, "evt-1").expect("query should succeed").expect("meeting should exist");
        assert_eq!(meeting.attendees.len(), 1);
        assert_eq!(meeting.attendees[0].email, "a@example.com");
        assert_eq!(meeting.attendees[0].response_status, "accepted");
    }

    #[test]
    fn resyncing_an_event_replaces_the_attendee_list_to_match_google() {
        let conn = test_db("sync_attendees_replace_test.db");
        let first = confirmed_event(
            "evt-2",
            vec![google_events::GoogleEventAttendee { email: "old@example.com".to_string(), display_name: None, response_status: None }],
        );
        apply_synced_event(&conn, &first).expect("first sync should succeed");

        let second = confirmed_event(
            "evt-2",
            vec![google_events::GoogleEventAttendee { email: "new@example.com".to_string(), display_name: None, response_status: None }],
        );
        apply_synced_event(&conn, &second).expect("second sync should succeed");

        let meeting = store::get_meeting_by_google_event_id(&conn, "evt-2").expect("query should succeed").expect("meeting should exist");
        assert_eq!(meeting.attendees.len(), 1);
        assert_eq!(meeting.attendees[0].email, "new@example.com");
    }
}
