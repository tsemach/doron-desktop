//! Google People API client for importing contacts (ASC-176, PR-5).
//! Reuses the existing Google Calendar OAuth connection's access token
//! (`calendar::oauth::get_valid_access_token`) -- see that constant's
//! doc-comment for why this doesn't have its own OAuth module/account table
//! (docs/contact/design.md §4.7/§8, decided).

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const PEOPLE_API_BASE: &str = "https://people.googleapis.com/v1/people/me/connections";
const PERSON_FIELDS: &str = "names,emailAddresses,phoneNumbers,organizations";
const PAGE_SIZE: u32 = 200;
/// Hard cap on the total number of contacts fetched across all pages, so a
/// Google account with an unusually large contact list can't turn this into
/// an unbounded loop against the People API.
const MAX_CONTACTS: usize = 1000;

/// One importable Google contact, already flattened to this feature's
/// `Contact` shape (design.md §3.1: email is the only mandatory field) --
/// people with no email are dropped before this type is ever constructed,
/// see `list_google_contacts`.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleContact {
    pub resource_name: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub organization: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ConnectionsResponse {
    #[serde(default)]
    connections: Vec<Person>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Person {
    #[serde(rename = "resourceName")]
    resource_name: String,
    #[serde(default)]
    names: Vec<PersonName>,
    #[serde(default, rename = "emailAddresses")]
    email_addresses: Vec<PersonValue>,
    #[serde(default, rename = "phoneNumbers")]
    phone_numbers: Vec<PersonValue>,
    #[serde(default)]
    organizations: Vec<PersonOrganization>,
}

#[derive(Debug, Deserialize)]
struct PersonName {
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PersonValue {
    value: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PersonOrganization {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleApiErrorEnvelope {
    error: GoogleApiErrorBody,
}

#[derive(Debug, Deserialize)]
struct GoogleApiErrorBody {
    message: String,
    #[serde(default)]
    status: Option<String>,
}

/// Sentinel error string `list_google_contacts` returns instead of Google's
/// raw error message when the failure is specifically an insufficient-scope
/// rejection -- i.e. someone connected Google Calendar *before* this PR
/// added `contacts.readonly` to `GOOGLE_CALENDAR_SCOPE` (see oauth.rs), so
/// their stored refresh token was issued under the old 2-scope grant. Google
/// doesn't retroactively add newly-requested scopes to an existing grant;
/// re-consenting (disconnect/reconnect, or just calling
/// `connect_google_calendar` again -- it always sends `prompt=consent`)
/// picks up the new scope. Exported so the frontend can match on this exact
/// string and show a "reconnect" affordance instead of Google's raw message.
pub const INSUFFICIENT_SCOPE_ERROR: &str = "google_people_insufficient_scope";

async fn google_error_message(response: reqwest::Response) -> String {
    let status = response.status();
    match response.json::<GoogleApiErrorEnvelope>().await {
        Ok(body) => {
            // Google's actual shape for this case: HTTP 403,
            // error.status = "PERMISSION_DENIED", error.message = "Request
            // had insufficient authentication scopes." -- checking the HTTP
            // status, error.status, *and* the message content (rather than
            // any one alone) avoids misclassifying an unrelated 403 (e.g.
            // the People API being disabled on the Cloud project) as a
            // scope problem.
            let is_insufficient_scope = status == reqwest::StatusCode::FORBIDDEN
                && body.error.status.as_deref() == Some("PERMISSION_DENIED")
                && body.error.message.to_lowercase().contains("insufficient")
                && body.error.message.to_lowercase().contains("scope");
            if is_insufficient_scope {
                return INSUFFICIENT_SCOPE_ERROR.to_string();
            }
            body.error.message
        }
        Err(_) => format!("Google People request failed ({status})"),
    }
}

/// Fetches the connected Google account's contacts via People API
/// `people.connections.list`, paginating until either Google stops returning
/// a `nextPageToken` or `MAX_CONTACTS` is reached. Contacts with no email
/// address are skipped entirely -- this feature's `Contact` model requires
/// one (design.md §3.1) and there's nothing useful to import without it.
/// Takes the first entry of each of names/emailAddresses/phoneNumbers/
/// organizations -- the People API can return several of each per person,
/// but this feature only needs one.
#[tauri::command]
pub async fn list_google_contacts(app: AppHandle) -> Result<Vec<GoogleContact>, String> {
    let access_token = crate::calendar::oauth::get_valid_access_token(&app).await?;
    let client = reqwest::Client::new();

    let mut contacts = Vec::new();
    let mut page_token: Option<String> = None;

    loop {
        let mut query: Vec<(&str, &str)> = vec![("personFields", PERSON_FIELDS)];
        let page_size_str = PAGE_SIZE.to_string();
        query.push(("pageSize", page_size_str.as_str()));
        if let Some(token) = page_token.as_deref() {
            query.push(("pageToken", token));
        }

        let response = client
            .get(PEOPLE_API_BASE)
            .bearer_auth(&access_token)
            .query(&query)
            .send()
            .await
            .map_err(|e| format!("Failed to reach Google Contacts: {e}"))?;

        if !response.status().is_success() {
            return Err(google_error_message(response).await);
        }

        let body: ConnectionsResponse = response.json().await.map_err(|e| format!("Unexpected response from Google Contacts: {e}"))?;

        for person in body.connections {
            let Some(email) = person.email_addresses.into_iter().find_map(|e| e.value) else {
                continue;
            };
            contacts.push(GoogleContact {
                resource_name: person.resource_name,
                name: person.names.into_iter().find_map(|n| n.display_name),
                email: Some(email),
                phone: person.phone_numbers.into_iter().find_map(|p| p.value),
                organization: person.organizations.into_iter().find_map(|o| o.name),
            });

            if contacts.len() >= MAX_CONTACTS {
                return Ok(contacts);
            }
        }

        page_token = body.next_page_token;
        if page_token.is_none() {
            break;
        }
    }

    Ok(contacts)
}
