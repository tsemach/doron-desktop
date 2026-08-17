use tauri::AppHandle;
use crate::store;

#[tauri::command]
pub fn list_tasks_for_case(app: AppHandle, case_id: i64) -> Result<Vec<store::TaskRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_tasks_for_case(&conn, case_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_task(
    app: AppHandle,
    case_id: i64,
    title: String,
    description: Option<String>,
    estimate_value: Option<f64>,
    estimate_unit: Option<String>,
    due_date: Option<String>,
) -> Result<store::TaskRow, String> {
    let conn = store::open_db(&app)?;
    store::create_task(
        &conn,
        case_id,
        &title,
        description.as_deref(),
        estimate_value,
        estimate_unit.as_deref(),
        due_date.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_task(
    app: AppHandle,
    id: i64,
    title: String,
    description: Option<String>,
    estimate_value: Option<f64>,
    estimate_unit: Option<String>,
    due_date: Option<String>,
    status: String,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_task(
        &conn,
        id,
        &title,
        description.as_deref(),
        estimate_value,
        estimate_unit.as_deref(),
        due_date.as_deref(),
        &status,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_task_status(app: AppHandle, id: i64, status: String) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_task_status(&conn, id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_task(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::delete_task(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_tasks(app: AppHandle, task_ids: Vec<i64>) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::reorder_tasks(&conn, &task_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_all_tasks(app: AppHandle) -> Result<Vec<store::TaskWithCaseRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_all_tasks(&conn).map_err(|e| e.to_string())
}
