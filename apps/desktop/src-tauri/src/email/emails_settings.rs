use tauri::AppHandle;
use rusqlite::params;
use crate::store;
use crate::tags::{upsert_tag_internal, TagScope, TagType};
use super::types::EmailConfig;

#[tauri::command]
pub fn get_email_settings(app: AppHandle) -> Result<Option<EmailConfig>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT imap_server, imap_port, username, password_enc, provider, api_key_enc FROM email_configurations LIMIT 1")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row([], |r| {
        Ok(EmailConfig {
            imap_server: r.get(0)?,
            imap_port: r.get(1)?,
            username: r.get(2)?,
            password_enc: r.get(3)?,
            provider: r.get(4)?,
            api_key_enc: r.get(5).unwrap_or_default(),
        })
    });

    match row {
        Ok(config) => Ok(Some(config)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_email_settings(app: AppHandle, config: EmailConfig) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute("DELETE FROM email_configurations", []).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO email_configurations (imap_server, imap_port, username, password_enc, provider, api_key_enc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            config.imap_server,
            config.imap_port,
            config.username,
            config.password_enc,
            config.provider,
            config.api_key_enc
        ],
    ).map_err(|e| e.to_string())?;

    upsert_tag_internal(&app, TagScope::App, "useremail", Some(&config.username), TagType::System)
        .map_err(|e| format!("[save_email_settings] failed to write useremail system tag: {e}"))?;

    Ok(())
}

pub(crate) fn get_email_settings_internal(app: &AppHandle) -> Option<EmailConfig> {
    let conn = store::open_db(app).ok()?;
    let mut stmt = conn
        .prepare("SELECT imap_server, imap_port, username, password_enc, provider, api_key_enc FROM email_configurations LIMIT 1")
        .ok()?;

    stmt.query_row([], |r| {
        Ok(EmailConfig {
            imap_server: r.get(0)?,
            imap_port: r.get(1)?,
            username: r.get(2)?,
            password_enc: r.get(3)?,
            provider: r.get(4)?,
            api_key_enc: r.get(5).unwrap_or_default(),
        })
    }).ok()
}
