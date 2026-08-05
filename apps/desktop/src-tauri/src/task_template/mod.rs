use tauri::AppHandle;
use crate::store;

#[tauri::command]
pub fn list_task_templates(app: AppHandle) -> Result<Vec<store::TaskTemplateRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_task_templates(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_task_template(
    app: AppHandle,
    name: String,
    items: Vec<store::TaskTemplateItemInput>,
) -> Result<i64, String> {
    let conn = store::open_db(&app)?;
    store::create_task_template(&conn, &name, &items).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_task_template(
    app: AppHandle,
    id: i64,
    name: String,
    items: Vec<store::TaskTemplateItemInput>,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_task_template(&conn, id, &name, &items).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_task_template(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::delete_task_template(&conn, id).map_err(|e| e.to_string())
}
