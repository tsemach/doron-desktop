//! Pre-meeting OS notification (ASC-163 R6). A second, independent
//! `tokio::time::interval` loop from the sync poller (sync.rs) -- a slow or
//! failing Google API call must never delay a time-sensitive reminder
//! (design.md §7).

use std::collections::HashSet;

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::store;

pub const REMINDER_SCAN_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);
pub const REMINDER_LEAD_TIME_SECONDS: i64 = 5 * 60;

/// `notified` is in-memory, not persisted (design.md §3) -- a missed/duplicate
/// reminder across an app restart is a minor annoyance, not a correctness
/// issue, and avoids a table whose only job is dedup bookkeeping.
pub async fn remind_upcoming_meetings_background(app: AppHandle) {
    let mut interval = tokio::time::interval(REMINDER_SCAN_INTERVAL);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut notified: HashSet<i64> = HashSet::new();
    loop {
        interval.tick().await;
        if let Err(e) = scan_and_notify(&app, &mut notified) {
            println!("[Calendar Reminder Error] {e}");
        }
    }
}

fn scan_and_notify(app: &AppHandle, notified: &mut HashSet<i64>) -> Result<(), String> {
    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();
    let window_end_str = (now + chrono::Duration::seconds(REMINDER_LEAD_TIME_SECONDS)).to_rfc3339();

    let conn = store::open_db(app)?;
    // list_meetings_for_range is an overlap query (also matches meetings
    // already in progress) -- narrow to "hasn't started yet, starts within
    // the lead time" here, since a reminder is about what's *about to*
    // happen, not what's already ongoing. RFC3339 strings from
    // chrono::Utc::now() are always UTC with a fixed-width offset, so
    // lexicographic string comparison matches chronological order.
    let upcoming: Vec<_> = store::list_meetings_for_range(&conn, &now_str, &window_end_str)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|m| m.start_time > now_str && m.start_time <= window_end_str)
        .collect();

    // Drop ids that fell out of the upcoming window (started, moved, or
    // deleted) so `notified` doesn't grow without bound in a long session.
    notified.retain(|id| upcoming.iter().any(|m| m.id == *id));

    for meeting in upcoming {
        if notified.insert(meeting.id) {
            let body = format!("Starting at {}", meeting.start_time);
            // Silently swallowed on failure (e.g. OS notification permission
            // denied/never granted) -- the meeting still shows in-app, just
            // without the OS popup (design.md §13).
            let _ = app.notification().builder().title(meeting.title).body(body).show();
        }
    }
    Ok(())
}
