use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

use crate::store;

pub mod task_scanner;

pub struct NewNotification {
    pub category: String,
    pub title: String,
    pub body: String,
    pub click_target: Option<serde_json::Value>,
}

/// The entire integration surface a producer needs to raise a notification:
/// one function call, no direct SQL, no event-emitting boilerplate.
pub fn create(app: &AppHandle, new: NewNotification) -> Result<i64, String> {
    let conn = store::open_db(app)?;
    store::ensure_notification_settings_row(&conn, &new.category).map_err(|e| e.to_string())?;
    let settings = store::get_notification_settings_for_category(&conn, &new.category).map_err(|e| e.to_string())?;

    let click_target_json = new.click_target.as_ref().map(|v| v.to_string());
    let id = store::insert_notification(&conn, &new.category, &new.title, &new.body, click_target_json.as_deref())
        .map_err(|e| e.to_string())?;

    if settings.in_app_enabled {
        if let Ok(row) = store::get_notification(&conn, id) {
            let _ = app.emit("notification-created", &row);
        }
    }
    if settings.os_toast_enabled {
        let _ = app.notification().builder().title(&new.title).body(&new.body).show();
    }
    Ok(id)
}

#[tauri::command]
pub fn list_notifications(app: AppHandle, status_filter: Option<String>) -> Result<Vec<store::NotificationRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_notifications(&conn, status_filter.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_notification_status(app: AppHandle, id: i64, status: String) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_notification_status(&conn, id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snooze_notification(app: AppHandle, id: i64, until: String) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::snooze_notification(&conn, id, &until).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_notification_settings(app: AppHandle) -> Result<Vec<store::NotificationSettingsRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_notification_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_notification_settings(app: AppHandle, category: String, in_app_enabled: bool, os_toast_enabled: bool) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_notification_settings(&conn, &category, in_app_enabled, os_toast_enabled).map_err(|e| e.to_string())
}
