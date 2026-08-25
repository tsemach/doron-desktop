//! Thin Google Calendar API v3 `events` client, shared by the sync poller
//! (list) and the meeting CRUD commands (insert/patch/delete) so both go
//! through one place rather than duplicating request/error-handling shape.

use serde::Deserialize;

const CALENDAR_API_BASE: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

pub struct EventInput<'a> {
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub location: Option<&'a str>,
    pub start_time: &'a str,
    pub end_time: &'a str,
    pub attendees: &'a [AttendeeInput<'a>],
}

/// Google-API-shaped attendee to send on insert/patch -- deliberately not
/// `store::AttendeeInput` (which also carries `response_status`): Google is
/// authoritative for RSVP state, Ascurix never writes it.
pub struct AttendeeInput<'a> {
    pub email: &'a str,
    pub display_name: Option<&'a str>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GoogleEvent {
    pub id: String,
    pub status: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: Option<GoogleEventDateTime>,
    pub end: Option<GoogleEventDateTime>,
    #[serde(default)]
    pub attendees: Vec<GoogleEventAttendee>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GoogleEventAttendee {
    pub email: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(rename = "responseStatus")]
    pub response_status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GoogleEventDateTime {
    #[serde(rename = "dateTime")]
    pub date_time: Option<String>,
    /// All-day events carry `date` (no time component) instead of `dateTime`.
    pub date: Option<String>,
}

impl GoogleEventDateTime {
    pub fn as_rfc3339(&self) -> Option<String> {
        self.date_time.clone().or_else(|| self.date.clone())
    }
}

#[derive(Debug, Deserialize)]
struct EventsListResponse {
    #[serde(default)]
    items: Vec<GoogleEvent>,
    #[serde(rename = "nextSyncToken")]
    next_sync_token: Option<String>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

/// A single events.list page. `SyncTokenExpired` surfaces Google's 410 Gone
/// so the caller can fall back to a full resync (design.md §5).
pub enum ListEventsResult {
    Page { events: Vec<GoogleEvent>, next_page_token: Option<String>, next_sync_token: Option<String> },
    SyncTokenExpired,
}

pub async fn list_events(
    client: &reqwest::Client,
    access_token: &str,
    sync_token: Option<&str>,
    page_token: Option<&str>,
    time_min: Option<&str>,
) -> Result<ListEventsResult, String> {
    let mut query: Vec<(&str, &str)> = vec![("singleEvents", "true")];
    if let Some(token) = sync_token {
        query.push(("syncToken", token));
    } else if let Some(time_min) = time_min {
        query.push(("timeMin", time_min));
    }
    if let Some(page_token) = page_token {
        query.push(("pageToken", page_token));
    }

    let response = client
        .get(CALENDAR_API_BASE)
        .bearer_auth(access_token)
        .query(&query)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Google Calendar: {e}"))?;

    if response.status() == reqwest::StatusCode::GONE {
        return Ok(ListEventsResult::SyncTokenExpired);
    }
    if !response.status().is_success() {
        return Err(google_error_message(response).await);
    }

    let body: EventsListResponse = response.json().await.map_err(|e| format!("Unexpected response from Google Calendar: {e}"))?;
    Ok(ListEventsResult::Page {
        events: body.items,
        next_page_token: body.next_page_token,
        next_sync_token: body.next_sync_token,
    })
}

pub async fn insert_event(client: &reqwest::Client, access_token: &str, input: &EventInput<'_>) -> Result<GoogleEvent, String> {
    let response = client
        .post(CALENDAR_API_BASE)
        .bearer_auth(access_token)
        // Without this, Google's default (sendUpdates=none) creates/patches
        // the event but never emails newly-added attendees -- silently
        // defeating "adding people to a meeting" (docs/calendar/
        // adding-people-to-meeting.md §4).
        .query(&[("sendUpdates", "all")])
        .json(&event_body(input))
        .send()
        .await
        .map_err(|e| format!("Failed to reach Google Calendar: {e}"))?;
    if !response.status().is_success() {
        return Err(google_error_message(response).await);
    }
    response.json().await.map_err(|e| format!("Unexpected response from Google Calendar: {e}"))
}

pub async fn patch_event(
    client: &reqwest::Client,
    access_token: &str,
    google_event_id: &str,
    input: &EventInput<'_>,
) -> Result<GoogleEvent, String> {
    let response = client
        .patch(format!("{CALENDAR_API_BASE}/{google_event_id}"))
        .bearer_auth(access_token)
        .query(&[("sendUpdates", "all")])
        .json(&event_body(input))
        .send()
        .await
        .map_err(|e| format!("Failed to reach Google Calendar: {e}"))?;
    if !response.status().is_success() {
        return Err(google_error_message(response).await);
    }
    response.json().await.map_err(|e| format!("Unexpected response from Google Calendar: {e}"))
}

pub async fn delete_event(client: &reqwest::Client, access_token: &str, google_event_id: &str) -> Result<(), String> {
    let response = client
        .delete(format!("{CALENDAR_API_BASE}/{google_event_id}"))
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Google Calendar: {e}"))?;
    // A 410 Gone here means the event was already gone server-side -- the end
    // state (no event) is identical to a successful delete.
    if response.status().is_success() || response.status() == reqwest::StatusCode::GONE {
        return Ok(());
    }
    Err(google_error_message(response).await)
}

fn event_body(input: &EventInput<'_>) -> serde_json::Value {
    let mut body = serde_json::json!({
        "summary": input.title,
        "description": input.description,
        "location": input.location,
        "start": { "dateTime": input.start_time },
        "end": { "dateTime": input.end_time },
    });
    if !input.attendees.is_empty() {
        let attendees: Vec<serde_json::Value> = input
            .attendees
            .iter()
            .map(|a| serde_json::json!({ "email": a.email, "displayName": a.display_name }))
            .collect();
        body["attendees"] = serde_json::Value::Array(attendees);
    }
    body
}

#[derive(Debug, Deserialize)]
struct GoogleApiErrorEnvelope {
    error: GoogleApiErrorBody,
}

#[derive(Debug, Deserialize)]
struct GoogleApiErrorBody {
    message: String,
}

async fn google_error_message(response: reqwest::Response) -> String {
    let status = response.status();
    match response.json::<GoogleApiErrorEnvelope>().await {
        Ok(body) => body.error.message,
        Err(_) => format!("Google Calendar request failed ({status})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_input<'a>(attendees: &'a [AttendeeInput<'a>]) -> EventInput<'a> {
        EventInput {
            title: "Kickoff",
            description: None,
            location: None,
            start_time: "2026-01-01T10:00:00+00:00",
            end_time: "2026-01-01T11:00:00+00:00",
            attendees,
        }
    }

    #[test]
    fn event_body_omits_attendees_when_empty() {
        let body = event_body(&base_input(&[]));
        assert!(body.get("attendees").is_none());
    }

    #[test]
    fn event_body_includes_attendees_with_email_and_display_name() {
        let attendees = [
            AttendeeInput { email: "a@example.com", display_name: Some("Alice") },
            AttendeeInput { email: "b@example.com", display_name: None },
        ];
        let body = event_body(&base_input(&attendees));

        let attendees_json = body.get("attendees").expect("attendees should be present").as_array().expect("attendees should be an array");
        assert_eq!(attendees_json.len(), 2);
        assert_eq!(attendees_json[0]["email"], "a@example.com");
        assert_eq!(attendees_json[0]["displayName"], "Alice");
        assert_eq!(attendees_json[1]["email"], "b@example.com");
        assert!(attendees_json[1].get("displayName").is_none() || attendees_json[1]["displayName"].is_null());
    }
}
