pub mod case_link;
pub mod google_events;
pub mod oauth;
pub mod reminder;
pub mod sync;

use serde::Deserialize;
use tauri::AppHandle;

use oauth::GoogleCalendarStatus;

/// Wire shape for an attendee coming from the frontend -- camelCase to match
/// every other Tauri command param (`caseId`, etc.). No `response_status`:
/// Ascurix never sets RSVP state, only Google does (docs/calendar/
/// adding-people-to-meeting.md §5).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendeeInputDto {
    pub email: String,
    pub display_name: Option<String>,
}

/// Stores whatever Google's insert/patch response says about attendees
/// (including `responseStatus`) rather than trusting the request payload --
/// Google is authoritative for RSVP state (§5/§6 of the design doc), so this
/// is shared by both create_meeting and update_meeting.
fn attendees_from_google_event(event: &google_events::GoogleEvent) -> Vec<crate::store::AttendeeInput<'_>> {
    event
        .attendees
        .iter()
        .map(|a| crate::store::AttendeeInput {
            email: &a.email,
            display_name: a.display_name.as_deref(),
            response_status: a.response_status.as_deref().unwrap_or("needsAction"),
        })
        .collect()
}

/// Runs the full OAuth connect flow (opens the browser, catches the loopback
/// redirect, exchanges the code, persists the account) and resolves once
/// it's actually done -- see oauth::connect for why this can't use a
/// deep-link callback (Google no longer supports custom URI schemes for
/// Desktop-app OAuth clients).
#[tauri::command]
pub async fn connect_google_calendar(app: AppHandle) -> Result<(), String> {
    oauth::connect(&app).await
}

#[tauri::command]
pub fn disconnect_google_calendar(app: AppHandle) -> Result<(), String> {
    oauth::clear_google_calendar_account_internal(&app)
}

/// Drives the Calendar tab's connect-prompt vs. calendar-UI branch (design.md
/// §9) -- None means "show the connect prompt".
#[tauri::command]
pub fn get_google_calendar_status(app: AppHandle) -> Result<Option<GoogleCalendarStatus>, String> {
    Ok(oauth::read_google_calendar_account_internal(&app)?.map(|account| GoogleCalendarStatus {
        google_email: account.google_email,
        connected_at: account.connected_at,
    }))
}

/// Write-through create (design.md §1 goal 2, §6): the event is created in
/// Google first, and only mirrored locally once that succeeds -- there must
/// never be a local meeting Google doesn't also have. `case_id` from the
/// frontend (an explicit manual pick) always wins over the description
/// phrase; the phrase is only consulted when the caller left `case_id` unset.
#[tauri::command]
pub async fn create_meeting(
    app: AppHandle,
    title: String,
    description: Option<String>,
    location: Option<String>,
    start_time: String,
    end_time: String,
    case_id: Option<i64>,
    attendees: Vec<AttendeeInputDto>,
) -> Result<crate::store::MeetingRow, String> {
    let conn = crate::store::open_db(&app)?;
    let (resolved_case_id, case_link_source) = match case_id {
        Some(case_id) => (Some(case_id), "manual".to_string()),
        None => case_link::resolve_case_link(&conn, description.as_deref())?,
    };
    // Write-back: a manually-attached case (as opposed to one auto-detected
    // from an existing phrase) gets a "case:"/"תיק:" line added to the
    // description that's actually sent to Google, so the link is visible in
    // Google Calendar itself, not just inside Ascurix.
    let description = write_back_case_link(&conn, description, case_link_source.as_str(), resolved_case_id)?;

    let access_token = oauth::get_valid_access_token(&app).await?;
    let client = reqwest::Client::new();
    let google_attendees: Vec<google_events::AttendeeInput> =
        attendees.iter().map(|a| google_events::AttendeeInput { email: &a.email, display_name: a.display_name.as_deref() }).collect();
    let google_event = google_events::insert_event(
        &client,
        &access_token,
        &google_events::EventInput {
            title: &title,
            description: description.as_deref(),
            location: location.as_deref(),
            start_time: &start_time,
            end_time: &end_time,
            attendees: &google_attendees,
        },
    )
    .await?;

    let meeting = crate::store::upsert_meeting(
        &conn,
        crate::store::UpsertMeetingInput {
            google_event_id: &google_event.id,
            case_id: resolved_case_id,
            case_link_source: &case_link_source,
            title: &title,
            description: description.as_deref(),
            location: location.as_deref(),
            start_time: &start_time,
            end_time: &end_time,
            status: "confirmed",
        },
    )
    .map_err(|e| e.to_string())?;

    crate::store::replace_meeting_attendees(&conn, meeting.id, &attendees_from_google_event(&google_event)).map_err(|e| e.to_string())?;
    crate::store::get_meeting(&conn, meeting.id).map_err(|e| e.to_string())?.ok_or_else(|| "Meeting not found after create".to_string())
}

/// Shared by create_meeting/update_meeting: only rewrites `description` when
/// the case was attached manually (case_link_source == "manual") -- a
/// phrase-detected link means the phrase is already there, nothing to add.
fn write_back_case_link(
    conn: &rusqlite::Connection,
    description: Option<String>,
    case_link_source: &str,
    resolved_case_id: Option<i64>,
) -> Result<Option<String>, String> {
    if case_link_source != "manual" {
        return Ok(description);
    }
    let Some(case_id) = resolved_case_id else {
        return Ok(description);
    };
    let Some(case_name) = case_link::get_case_label(conn, case_id)? else {
        return Ok(description);
    };
    Ok(Some(case_link::ensure_case_phrase_in_description(description.as_deref(), &case_name)))
}

#[tauri::command]
pub async fn update_meeting(
    app: AppHandle,
    id: i64,
    title: String,
    description: Option<String>,
    location: Option<String>,
    start_time: String,
    end_time: String,
    case_id: Option<i64>,
    attendees: Vec<AttendeeInputDto>,
) -> Result<crate::store::MeetingRow, String> {
    let conn = crate::store::open_db(&app)?;
    let existing = crate::store::get_meeting(&conn, id).map_err(|e| e.to_string())?.ok_or("Meeting not found")?;

    let (resolved_case_id, case_link_source) = match case_id {
        Some(case_id) => (Some(case_id), "manual".to_string()),
        None => case_link::resolve_case_link(&conn, description.as_deref())?,
    };
    let description = write_back_case_link(&conn, description, case_link_source.as_str(), resolved_case_id)?;

    let access_token = oauth::get_valid_access_token(&app).await?;
    let client = reqwest::Client::new();
    let google_attendees: Vec<google_events::AttendeeInput> =
        attendees.iter().map(|a| google_events::AttendeeInput { email: &a.email, display_name: a.display_name.as_deref() }).collect();
    let google_event = google_events::patch_event(
        &client,
        &access_token,
        &existing.google_event_id,
        &google_events::EventInput {
            title: &title,
            description: description.as_deref(),
            location: location.as_deref(),
            start_time: &start_time,
            end_time: &end_time,
            attendees: &google_attendees,
        },
    )
    .await?;

    crate::store::update_meeting_row(&conn, id, &title, description.as_deref(), location.as_deref(), &start_time, &end_time, resolved_case_id, &case_link_source)
        .map_err(|e| e.to_string())?;
    crate::store::replace_meeting_attendees(&conn, id, &attendees_from_google_event(&google_event)).map_err(|e| e.to_string())?;
    crate::store::get_meeting(&conn, id).map_err(|e| e.to_string())?.ok_or_else(|| "Meeting not found after update".to_string())
}

#[tauri::command]
pub async fn delete_meeting(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = crate::store::open_db(&app)?;
    let existing = crate::store::get_meeting(&conn, id).map_err(|e| e.to_string())?.ok_or("Meeting not found")?;

    let access_token = oauth::get_valid_access_token(&app).await?;
    let client = reqwest::Client::new();
    google_events::delete_event(&client, &access_token, &existing.google_event_id).await?;

    crate::store::delete_meeting_row(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_meetings_for_range(app: AppHandle, start: String, end: String) -> Result<Vec<crate::store::MeetingRow>, String> {
    crate::blocking::run_blocking(move || {
        let conn = crate::store::open_db(&app)?;
        crate::store::list_meetings_for_range(&conn, &start, &end).map_err(|e| e.to_string())
    }).await
}

#[tauri::command]
pub async fn list_meetings_for_case(app: AppHandle, case_id: i64) -> Result<Vec<crate::store::MeetingRow>, String> {
    crate::blocking::run_blocking(move || {
        let conn = crate::store::open_db(&app)?;
        crate::store::list_meetings_for_case(&conn, case_id).map_err(|e| e.to_string())
    }).await
}

#[tauri::command]
pub async fn list_todays_meetings(app: AppHandle) -> Result<Vec<crate::store::MeetingRow>, String> {
    crate::blocking::run_blocking(move || {
        let conn = crate::store::open_db(&app)?;
        crate::store::list_todays_meetings(&conn).map_err(|e| e.to_string())
    }).await
}
