use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Session {
    pub token: String,
    pub email: String,
    pub tier: String,
    pub expires_at: String,
}

#[derive(Deserialize)]
struct DesktopLoginResponse {
    token: String,
    email: String,
    tier: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    error: Option<String>,
}

#[tauri::command]
pub fn get_session(app: AppHandle) -> Result<Option<Session>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT token, email, tier, expires_at FROM auth_session LIMIT 1")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row([], |r| {
        Ok(Session {
            token: r.get(0)?,
            email: r.get(1)?,
            tier: r.get(2)?,
            expires_at: r.get(3)?,
        })
    });

    match row {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn save_session_internal(app: &AppHandle, session: &Session) -> Result<(), String> {
    let conn = store::open_db(app)?;
    conn.execute("DELETE FROM auth_session", []).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO auth_session (token, email, tier, expires_at) VALUES (?1, ?2, ?3, ?4)",
        params![session.token, session.email, session.tier, session.expires_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_session(app: AppHandle, session: Session) -> Result<(), String> {
    save_session_internal(&app, &session)
}

/// OAuth login hand-off (0.9) — the deep-link listener in lib.rs extracts
/// these fields from `doron-desktop://auth?token=...&email=...&tier=...&expires_at=...`
/// and hands them here rather than this module depending on the `url` crate directly.
pub fn complete_oauth_login(
    app: &AppHandle,
    token: Option<String>,
    email: Option<String>,
    tier: Option<String>,
    expires_at: Option<String>,
) -> Result<(), String> {
    let (Some(token), Some(email), Some(tier), Some(expires_at)) = (token, email, tier, expires_at) else {
        return Err("OAuth deep link was missing one or more required fields".to_string());
    };
    save_session_internal(app, &Session { token, email, tier, expires_at })
}

#[tauri::command]
pub fn clear_session(app: AppHandle) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute("DELETE FROM auth_session", []).map_err(|e| e.to_string())?;
    Ok(())
}

/// Password login (0.7) — direct API call, no browser involved. OAuth login
/// (0.9) goes through the deep-link hand-off in lib.rs instead and calls
/// save_session directly once the token arrives.
///
/// `backend_url` is passed in by the caller rather than hardcoded here,
/// mirroring `doc_template::download::download_and_process_template` — the
/// frontend is the single source of truth for the backend URL (Vite's
/// `VITE_BACKEND_URL`), not a second copy living independently in Rust.
#[tauri::command]
pub async fn login_with_credentials(app: AppHandle, backend_url: String, email: String, password: String) -> Result<Session, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{backend_url}/api/v1/auth/desktop-login"))
        .json(&serde_json::json!({ "email": email, "password": password }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach the server: {e}"))?;

    let status = response.status();
    let body: DesktopLoginResponse = response
        .json()
        .await
        .map_err(|e| format!("Unexpected response from server: {e}"))?;

    if !status.is_success() {
        return Err(body.error.unwrap_or_else(|| "Login failed".to_string()));
    }

    let session = Session {
        token: body.token,
        email: body.email,
        tier: body.tier,
        expires_at: body.expires_at,
    };
    save_session_internal(&app, &session)?;
    Ok(session)
}
