use tauri::AppHandle;
use crate::store;

#[tauri::command]
pub fn list_case_templates(app: AppHandle) -> Result<Vec<store::CaseTemplateRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_case_templates(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_case_template(
    app: AppHandle,
    name: String,
    fields: Vec<String>,
    doc_template_ids: Vec<i64>,
) -> Result<i64, String> {
    let conn = store::open_db(&app)?;
    store::create_case_template(&conn, &name, &fields, &doc_template_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_case_template(
    app: AppHandle,
    id: i64,
    name: String,
    fields: Vec<String>,
    doc_template_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_case_template(&conn, id, &name, &fields, &doc_template_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_case_template(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::delete_case_template(&conn, id).map_err(|e| e.to_string())
}
