pub mod oauth;

use tauri::AppHandle;

use oauth::GoogleCalendarStatus;

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
