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

    store::upsert_meeting(
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
    Ok(())
}
