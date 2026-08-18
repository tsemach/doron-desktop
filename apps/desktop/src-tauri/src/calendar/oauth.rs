use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::store;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
// userinfo.email is required for fetch_account_email's call to
// GOOGLE_USERINFO_URL to actually return an email field -- calendar scope
// alone authorizes Calendar API access but not identity lookups, confirmed
// by hitting exactly this failure during manual testing ("Google did not
// return an email address").
const GOOGLE_CALENDAR_SCOPE: &str = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoogleCalendarAccount {
    pub google_email: String,
    pub access_token: String,
    pub refresh_token: String,
    pub token_expires_at: String,
    pub sync_token: Option<String>,
    pub connected_at: String,
}

/// Frontend-facing connection status -- deliberately omits the tokens.
#[derive(Serialize, Debug, Clone)]
pub struct GoogleCalendarStatus {
    pub google_email: String,
    pub connected_at: String,
}

/// The OAuth client is registered once against this app (a Google "Desktop
/// app" client type, which Google's own docs don't treat as confidential --
/// see the installed-app flow python/calender.py validated), not a per-user
/// secret. Baked in at COMPILE time via `option_env!`, not `std::env::var`
/// (which reads the *running process's* environment -- meaningless for a
/// distributed installer, since an end user's machine never has this set;
/// only a runtime read on the developer's own machine would ever see it).
/// `option_env!` rather than `env!` so a build without the var set still
/// *compiles* -- it only fails at the point this is actually called, same
/// failure mode as before, rather than breaking `cargo check`/`cargo build`
/// for anyone touching unrelated Rust code without these set.
///
/// Dev: export both before `pnpm desktop:dev` / `cargo tauri dev`.
/// Production: set as GitHub Actions repo secrets, consumed by
/// release.yml/deploy-desktop.yml's "Build and Release Tauri App" step --
/// same mechanism already used for TAURI_SIGNING_PRIVATE_KEY.
const CLIENT_ID: Option<&str> = option_env!("GOOGLE_CALENDAR_CLIENT_ID");
const CLIENT_SECRET: Option<&str> = option_env!("GOOGLE_CALENDAR_CLIENT_SECRET");

fn client_id() -> Result<String, String> {
    CLIENT_ID.map(str::to_string).ok_or_else(|| "GOOGLE_CALENDAR_CLIENT_ID is not set".to_string())
}

fn client_secret() -> Result<String, String> {
    CLIENT_SECRET.map(str::to_string).ok_or_else(|| "GOOGLE_CALENDAR_CLIENT_SECRET is not set".to_string())
}

// ── account storage (mirrors auth::read_session_internal / save_session_internal) ──

pub fn read_google_calendar_account_internal(app: &AppHandle) -> Result<Option<GoogleCalendarAccount>, String> {
    let conn = store::open_db(app)?;
    let mut stmt = conn
        .prepare("SELECT google_email, access_token, refresh_token, token_expires_at, sync_token, connected_at FROM google_calendar_accounts LIMIT 1")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row([], |r| {
        Ok(GoogleCalendarAccount {
            google_email: r.get(0)?,
            access_token: r.get(1)?,
            refresh_token: r.get(2)?,
            token_expires_at: r.get(3)?,
            sync_token: r.get(4)?,
            connected_at: r.get(5)?,
        })
    });

    match row {
        Ok(account) => Ok(Some(account)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn save_google_calendar_account_internal(app: &AppHandle, account: &GoogleCalendarAccount) -> Result<(), String> {
    let conn = store::open_db(app)?;
    conn.execute("DELETE FROM google_calendar_accounts", []).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO google_calendar_accounts (google_email, access_token, refresh_token, token_expires_at, sync_token, connected_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            account.google_email,
            account.access_token,
            account.refresh_token,
            account.token_expires_at,
            account.sync_token,
            account.connected_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Disconnecting clears both the account and its local mirror -- a `meetings`
/// row has no meaning once the Google account it was synced from is gone
/// (design.md §4).
pub fn clear_google_calendar_account_internal(app: &AppHandle) -> Result<(), String> {
    let conn = store::open_db(app)?;
    conn.execute("DELETE FROM google_calendar_accounts", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM meetings", []).map_err(|e| e.to_string())?;
    Ok(())
}

// ── OAuth flow ───────────────────────────────────────────────────────────────
//
// Google no longer supports custom URI scheme redirects for "Desktop app"
// OAuth clients ("due to the risk of app impersonation" -- Google's own
// OAuth-for-native-apps docs) -- only the loopback interface
// (http://127.0.0.1:PORT) is accepted, which is why this doesn't reuse the
// doron-desktop:// deep-link scheme backend auth uses. Mirrors exactly what
// Google's own Python quickstart (and this repo's python/calender.py spike)
// does via `InstalledAppFlow.run_local_server`: bind a random free port,
// send the user to Google with that port in `redirect_uri`, catch the single
// resulting request on a one-shot local HTTP listener.

/// Full connect flow: opens the system browser to Google's consent screen,
/// waits for the single resulting redirect on a local loopback listener, then
/// exchanges the code for tokens. Resolves only once the whole flow is done
/// (success or failure) -- the command awaiting this can drive its own UI
/// state directly rather than polling `get_google_calendar_status`.
pub async fn connect(app: &AppHandle) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to start local OAuth listener: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let client_id = client_id()?;
    // access_type=offline + prompt=consent guarantee a refresh_token comes
    // back even on a repeat connect (Google otherwise only issues one on the
    // very first consent).
    let auth_url = reqwest::Url::parse_with_params(
        GOOGLE_AUTH_URL,
        &[
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", GOOGLE_CALENDAR_SCOPE),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ],
    )
    .map_err(|e| format!("Failed to build consent URL: {e}"))?;

    app.opener()
        .open_url(auth_url.to_string(), None::<&str>)
        .map_err(|e| format!("Failed to open browser: {e}"))?;

    let code = accept_redirect(listener).await?;
    complete_connect(app, code, &redirect_uri).await
}

/// Accepts exactly one connection on the loopback listener, parses the
/// `code` (or `error`) query param off the request line, and responds with a
/// minimal "you can close this tab" page. Not a real HTTP server -- Google
/// only ever sends one GET request here, so a hand-rolled single-shot parse
/// is enough and avoids pulling in a server framework for this alone.
async fn accept_redirect(listener: tokio::net::TcpListener) -> Result<String, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let (mut stream, _) = listener
        .accept()
        .await
        .map_err(|e| format!("Failed to accept OAuth callback: {e}"))?;

    let mut buf = [0u8; 8192];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("Failed to read OAuth callback: {e}"))?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let request_line = request.lines().next().ok_or("Empty OAuth callback request")?;
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or("Malformed OAuth callback request")?;

    let callback_url = reqwest::Url::parse(&format!("http://127.0.0.1{path}"))
        .map_err(|e| format!("Failed to parse OAuth callback: {e}"))?;
    let params: std::collections::HashMap<String, String> = callback_url.query_pairs().into_owned().collect();

    // Deliberately doesn't claim success here -- this page only knows Google
    // redirected back with a `code`, not that the token exchange/account
    // save that happens next (still inside `connect`, after this returns)
    // actually succeeds. Overclaiming here is exactly what produced a
    // "connected!" page immediately followed by a real error in-app during
    // manual testing.
    let (status_line, body) = if params.contains_key("code") {
        ("HTTP/1.1 200 OK", "<html><body><h3>Finishing up in Ascurix...</h3><p>You can close this tab and return to Ascurix.</p></body></html>")
    } else {
        ("HTTP/1.1 200 OK", "<html><body><h3>Connection failed.</h3><p>You can close this tab and try again in Ascurix.</p></body></html>")
    };
    let response = format!("{status_line}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
    // Best-effort -- the OAuth outcome below doesn't depend on the browser
    // successfully rendering this page.
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;

    if let Some(error) = params.get("error") {
        return Err(format!("Google sign-in was cancelled or denied: {error}"));
    }
    params.get("code").cloned().ok_or_else(|| "Google did not return an authorization code".to_string())
}

#[derive(Deserialize)]
struct GoogleTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct GoogleUserInfo {
    email: Option<String>,
}

fn token_error(body: GoogleTokenResponse) -> String {
    body.error_description
        .or(body.error)
        .unwrap_or_else(|| "Google returned an unexpected token response".to_string())
}

/// Exchanges the OAuth `code` from the loopback callback for tokens, resolves
/// the connected account's email, and persists the account. `redirect_uri`
/// must be byte-identical to the one sent in the original authorization
/// request (Google validates this), which is why `connect` passes through
/// the exact value it generated rather than this reconstructing it.
async fn complete_connect(app: &AppHandle, code: String, redirect_uri: &str) -> Result<(), String> {
    let client_id = client_id()?;
    let client_secret = client_secret()?;
    let client = reqwest::Client::new();

    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to reach Google: {e}"))?;

    let body: GoogleTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Unexpected response from Google: {e}"))?;

    if body.error.is_some() {
        return Err(token_error(body));
    }
    let access_token = body.access_token.ok_or("Google did not return an access token")?;
    // A missing refresh_token here would silently degrade into an account
    // that stops syncing the moment the access token expires -- begin_connect
    // always sends prompt=consent specifically so this isn't reachable in
    // practice, but fail loudly rather than persist a half-working account.
    let refresh_token = body.refresh_token.ok_or("Google did not return a refresh token")?;
    let token_expires_at = (Utc::now() + chrono::Duration::seconds(body.expires_in.unwrap_or(3600))).to_rfc3339();

    let email = fetch_account_email(&client, &access_token).await?;

    save_google_calendar_account_internal(
        app,
        &GoogleCalendarAccount {
            google_email: email,
            access_token,
            refresh_token,
            token_expires_at,
            sync_token: None,
            connected_at: Utc::now().to_rfc3339(),
        },
    )
}

async fn fetch_account_email(client: &reqwest::Client, access_token: &str) -> Result<String, String> {
    let response = client
        .get(GOOGLE_USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Google: {e}"))?;
    let body: GoogleUserInfo = response
        .json()
        .await
        .map_err(|e| format!("Unexpected response from Google: {e}"))?;
    body.email.ok_or_else(|| "Google did not return an email address".to_string())
}

/// Returns a currently-valid access token, refreshing it via the stored
/// refresh_token first if the cached one has (or is about to) expire. Every
/// other calendar module (sync, meeting CRUD -- PR-2 onward) goes through
/// this rather than reading `access_token` off the stored account directly.
pub async fn get_valid_access_token(app: &AppHandle) -> Result<String, String> {
    let account = read_google_calendar_account_internal(app)?.ok_or("Google Calendar is not connected")?;

    let expires_at = DateTime::parse_from_rfc3339(&account.token_expires_at)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());
    if expires_at > Utc::now() + chrono::Duration::seconds(60) {
        return Ok(account.access_token);
    }

    let client_id = client_id()?;
    let client_secret = client_secret()?;
    let client = reqwest::Client::new();

    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", account.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to reach Google: {e}"))?;

    let body: GoogleTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Unexpected response from Google: {e}"))?;

    if body.error.is_some() {
        return Err(token_error(body));
    }
    let access_token = body.access_token.ok_or("Google did not return an access token")?;
    let token_expires_at = (Utc::now() + chrono::Duration::seconds(body.expires_in.unwrap_or(3600))).to_rfc3339();

    // The refresh grant doesn't reissue a refresh_token -- keep the existing one.
    let refreshed = GoogleCalendarAccount {
        access_token: access_token.clone(),
        token_expires_at,
        ..account
    };
    save_google_calendar_account_internal(app, &refreshed)?;
    Ok(access_token)
}
