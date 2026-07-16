use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store;
use crate::tags::{upsert_tag_internal, TagScope, TagType};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UserSettings {
    pub username: String,
}

#[tauri::command]
pub fn get_user_settings(app: AppHandle) -> Result<Option<UserSettings>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT username FROM user_settings LIMIT 1")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row([], |r| Ok(UserSettings { username: r.get(0)? }));
    match row {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_user_settings(app: AppHandle, settings: UserSettings) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute("DELETE FROM user_settings", []).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO user_settings (username) VALUES (?1)",
        params![settings.username],
    ).map_err(|e| e.to_string())?;

    upsert_tag_internal(&app, TagScope::App, "username", Some(&settings.username), TagType::System)
        .map_err(|e| format!("[save_user_settings] failed to write username system tag: {e}"))?;

    Ok(())
}
