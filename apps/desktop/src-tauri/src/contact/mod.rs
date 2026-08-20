//! Desktop Rust client for the backend-stored Contacts feature (see
//! `docs/contact/design.md` §4.2). Contact data (name/email/phone/organization)
//! is never stored locally — it lives exclusively in `apps/backend`'s Postgres
//! `contacts` table. The local `case_contacts` link table (`schema.rs`) only
//! points at a backend contact id per case.

pub mod google_people;
pub mod schema;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::auth;
use crate::store;

const GENERIC_ERROR: &str = "Something went wrong. Please try again.";

/// POSTs `body` (with `token` merged in) to `{backend_url}{path}`, returning
/// the parsed JSON body on 2xx or the server's `error` message otherwise.
/// Cloned from `org/mod.rs::call_org_desktop` — same shape, contacts-specific
/// sign-in error copy.
async fn call_contacts_desktop(app: &AppHandle, path: &str, mut body: Value) -> Result<Value, String> {
    let backend_url = auth::get_backend_url(app).ok_or("Sign in to manage your contacts.")?;
    let token = auth::get_session_token(app).ok_or("Sign in to manage your contacts.")?;

    if let Value::Object(map) = &mut body {
        map.insert("token".to_string(), Value::String(token));
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{backend_url}{path}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach the server: {e}"))?;

    let status = response.status();
    let json: Value = response.json().await.map_err(|_| GENERIC_ERROR.to_string())?;

    if !status.is_success() {
        let error = json.get("error").and_then(|v| v.as_str()).unwrap_or("Request failed").to_string();
        return Err(error);
    }

    Ok(json)
}

/// Matches `apps/backend/lib/contacts/crud.ts`'s `ContactEntry` shape exactly
/// (verified against that file on this branch, not just the design doc).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Contact {
    pub id: String,
    pub name: Option<String>,
    pub email: String,
    pub phone: Option<String>,
    pub organization: Option<String>,
    pub source: String,
    #[serde(rename = "ownedByMe")]
    pub owned_by_me: bool,
    #[serde(rename = "canEdit")]
    pub can_edit: bool,
    #[serde(rename = "updatedByUserId")]
    pub updated_by_user_id: Option<String>,
    // Always an array on the wire (possibly empty), never null/absent --
    // `attachSharedWith`/`buildMutationResultEntry` in crud.ts always set it.
    #[serde(rename = "sharedWith", default)]
    pub shared_with: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

/// Best-effort local side effect of a successful create/update (design.md
/// §4.2a): mirror a non-empty `organization` into the local `tags` table
/// (`scope_type='app'`) so it shows up in `CaseManagementOrganizationField`'s
/// autocomplete. Never allowed to fail the contact write itself -- logged and
/// swallowed, same convention as `emails_alerts.rs`'s existing best-effort
/// `learn_from_confirmed_email` call.
fn record_organization_suggestion(app: &AppHandle, organization: &Option<String>) {
    let Some(organization) = organization else { return };
    if organization.trim().is_empty() {
        return;
    }

    if let Err(e) = crate::tags::upsert_tag_internal(
        app,
        crate::tags::TagScope::App,
        "organization",
        Some(organization.as_str()),
        crate::tags::TagType::User,
    ) {
        eprintln!("[contact] could not record organization suggestion: {e}");
    }
}

// ── Backend-calling commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn list_contacts(app: AppHandle) -> Result<Vec<Contact>, String> {
    let json = call_contacts_desktop(&app, "/api/v1/contacts/desktop/list", json!({})).await?;
    serde_json::from_value(json.get("contacts").cloned().unwrap_or(Value::Array(vec![]))).map_err(|_| GENERIC_ERROR.to_string())
}

#[tauri::command]
pub async fn create_contact(
    app: AppHandle,
    name: Option<String>,
    email: String,
    phone: Option<String>,
    organization: Option<String>,
    google_contact_id: Option<String>,
    // How this contact was first created (design.md §3.1 -- distinct from
    // case_contacts.source, which records how it was *linked to this case*).
    // Optional and omitted by every pre-existing caller (case-creation,
    // email-confirmation auto-contacts) -- the backend defaults to "manual"
    // when absent. Only the Google Contacts import dialog passes "google".
    source: Option<String>,
) -> Result<Contact, String> {
    let json = call_contacts_desktop(
        &app,
        "/api/v1/contacts/desktop",
        json!({ "name": name, "email": email, "phone": phone, "organization": organization, "googleContactId": google_contact_id, "source": source }),
    )
    .await?;
    let contact: Contact =
        serde_json::from_value(json.get("contact").cloned().unwrap_or(Value::Null)).map_err(|_| GENERIC_ERROR.to_string())?;

    record_organization_suggestion(&app, &organization);

    Ok(contact)
}

#[tauri::command]
pub async fn update_contact(
    app: AppHandle,
    id: String,
    name: Option<String>,
    phone: Option<String>,
    organization: Option<String>,
) -> Result<Contact, String> {
    let json = call_contacts_desktop(
        &app,
        "/api/v1/contacts/desktop/update",
        json!({ "id": id, "name": name, "phone": phone, "organization": organization }),
    )
    .await?;
    let contact: Contact =
        serde_json::from_value(json.get("contact").cloned().unwrap_or(Value::Null)).map_err(|_| GENERIC_ERROR.to_string())?;

    record_organization_suggestion(&app, &organization);

    Ok(contact)
}

#[tauri::command]
pub async fn delete_contact(app: AppHandle, id: String) -> Result<(), String> {
    call_contacts_desktop(&app, "/api/v1/contacts/desktop/delete", json!({ "id": id })).await?;
    Ok(())
}

#[tauri::command]
pub async fn share_contact(app: AppHandle, contact_id: String, recipient_user_id: String) -> Result<Contact, String> {
    let json = call_contacts_desktop(
        &app,
        "/api/v1/contacts/desktop/share",
        json!({ "contactId": contact_id, "recipientUserId": recipient_user_id }),
    )
    .await?;
    serde_json::from_value(json.get("contact").cloned().unwrap_or(Value::Null)).map_err(|_| GENERIC_ERROR.to_string())
}

#[tauri::command]
pub async fn unshare_contact(app: AppHandle, contact_id: String, recipient_user_id: String) -> Result<(), String> {
    call_contacts_desktop(
        &app,
        "/api/v1/contacts/desktop/unshare",
        json!({ "contactId": contact_id, "recipientUserId": recipient_user_id }),
    )
    .await?;
    Ok(())
}

// ── Local-only commands (case_contacts link table, no backend call) ────────

#[tauri::command]
pub fn add_contact_to_case(app: AppHandle, case_id: i64, backend_contact_id: String, source: String) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute(
        "INSERT OR IGNORE INTO case_contacts (case_id, backend_contact_id, source, added_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![case_id, backend_contact_id, source, chrono::Utc::now().to_rfc3339()],
    )
    .map_err(|e| format!("[add_contact_to_case] {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn remove_contact_from_case(app: AppHandle, case_id: i64, backend_contact_id: String) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute(
        "DELETE FROM case_contacts WHERE case_id = ?1 AND backend_contact_id = ?2",
        params![case_id, backend_contact_id],
    )
    .map_err(|e| format!("[remove_contact_from_case] {e}"))?;
    Ok(())
}

// ── Hybrid command (local ids -> backend batch resolve) ────────────────────

#[tauri::command]
pub async fn list_contacts_for_case(app: AppHandle, case_id: i64) -> Result<Vec<Contact>, String> {
    let ids: Vec<String> = {
        let conn = store::open_db(&app)?;
        let mut stmt = conn
            .prepare("SELECT backend_contact_id FROM case_contacts WHERE case_id = ?1")
            .map_err(|e| format!("[list_contacts_for_case] {e}"))?;
        let rows = stmt
            .query_map(params![case_id], |row| row.get::<_, String>(0))
            .map_err(|e| format!("[list_contacts_for_case] {e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("[list_contacts_for_case] {e}"))?
    };

    if ids.is_empty() {
        return Ok(vec![]);
    }

    // The backend already filters to what the caller can currently see
    // (getContactsByIds) -- no additional filtering here (design.md §8).
    let json = call_contacts_desktop(&app, "/api/v1/contacts/desktop/by-ids", json!({ "ids": ids })).await?;
    serde_json::from_value(json.get("contacts").cloned().unwrap_or(Value::Array(vec![]))).map_err(|_| GENERIC_ERROR.to_string())
}
