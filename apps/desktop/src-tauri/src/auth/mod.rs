use chrono::{DateTime, Utc};
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

// Success and error responses from /api/v1/auth/desktop-login share no
// required fields (the error shape is just `{ error }`), so every field
// here must be optional -- otherwise serde fails to decode the error shape
// at all and the real backend message never reaches the user.
#[derive(Deserialize)]
struct DesktopLoginResponse {
    token: Option<String>,
    email: Option<String>,
    tier: Option<String>,
    #[serde(rename = "expiresAt")]
    expires_at: Option<String>,
    error: Option<String>,
}

// Same shape as DesktopLoginResponse minus `token` -- verification never
// reissues the token, only confirms the existing one is still valid.
#[derive(Deserialize)]
struct DesktopSessionVerifyResponse {
    email: Option<String>,
    tier: Option<String>,
    #[serde(rename = "expiresAt")]
    expires_at: Option<String>,
}

/// Reads the local session, treating a past (or unparsable) `expires_at` as
/// no session at all -- previously this check only existed client-side in
/// authStore.ts::refreshSession, so a Rust-side caller (as Phase 3's
/// is_pro_tier now is) would have seen a stale session as still valid.
fn read_session_internal(app: &AppHandle) -> Result<Option<Session>, String> {
    let conn = store::open_db(app)?;
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

    let session = match row {
        Ok(session) => session,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    let is_expired = DateTime::parse_from_rfc3339(&session.expires_at)
        .map(|expires| expires.with_timezone(&Utc) < Utc::now())
        .unwrap_or(true);

    Ok(if is_expired { None } else { Some(session) })
}

#[tauri::command]
pub fn get_session(app: AppHandle) -> Result<Option<Session>, String> {
    read_session_internal(&app)
}

/// Free falls back to whenever the session can't be read at all (signed
/// out, expired, or a DB error) -- a stale/missing read should never
/// silently grant Pro. Used by the AI-gating checks added in Phase 3
/// (indexer, query reranking, email ingestion, llm commands).
pub fn is_pro_tier(app: &AppHandle) -> bool {
    read_session_internal(app)
        .ok()
        .flatten()
        .map(|s| s.tier == "pro")
        .unwrap_or(false)
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

fn clear_session_internal(app: &AppHandle) -> Result<(), String> {
    let conn = store::open_db(app)?;
    conn.execute("DELETE FROM auth_session", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_session(app: AppHandle) -> Result<(), String> {
    clear_session_internal(&app)
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

    const GENERIC_ERROR: &str = "Something went wrong while signing in. Please try again.";

    let status = response.status();
    let body: DesktopLoginResponse = response
        .json()
        .await
        .map_err(|_| GENERIC_ERROR.to_string())?;

    if !status.is_success() {
        return Err(body.error.unwrap_or_else(|| "Login failed".to_string()));
    }

    let session = Session {
        token: body.token.ok_or(GENERIC_ERROR)?,
        email: body.email.ok_or(GENERIC_ERROR)?,
        tier: body.tier.ok_or(GENERIC_ERROR)?,
        expires_at: body.expires_at.ok_or(GENERIC_ERROR)?,
    };
    save_session_internal(&app, &session)?;
    Ok(session)
}

/// Re-checks the cached local session against the backend -- deleting a
/// user (or downgrading their tier) only takes effect server-side; nothing
/// previously told an already-logged-in desktop app about it, so it kept
/// trusting the cached session for up to its full 30-day TTL regardless.
/// Called from authStore.ts::refreshSession on every app startup/focus.
///
/// A network failure (offline, backend unreachable) is NOT treated as
/// invalidation -- it falls back to the cached session, preserving the
/// offline-first behavior PLAN.md's Phase 0 assumptions call for. Only an
/// explicit rejection from the backend (401: token no longer exists, or
/// expired server-side) clears the local session.
#[tauri::command]
pub async fn verify_session(app: AppHandle, backend_url: String) -> Result<Option<Session>, String> {
    let Some(local_session) = read_session_internal(&app)? else {
        return Ok(None);
    };

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{backend_url}/api/v1/auth/desktop-session"))
        .json(&serde_json::json!({ "token": local_session.token }))
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await;

    let response = match response {
        Ok(r) => r,
        Err(_) => return Ok(Some(local_session)),
    };

    let status = response.status();
    let body: DesktopSessionVerifyResponse = match response.json().await {
        Ok(b) => b,
        Err(_) => return Ok(Some(local_session)),
    };

    if !status.is_success() {
        clear_session_internal(&app)?;
        return Ok(None);
    }

    let refreshed = Session {
        token: local_session.token,
        email: body.email.unwrap_or(local_session.email),
        tier: body.tier.unwrap_or(local_session.tier),
        expires_at: body.expires_at.unwrap_or(local_session.expires_at),
    };
    save_session_internal(&app, &refreshed)?;
    Ok(Some(refreshed))
}
