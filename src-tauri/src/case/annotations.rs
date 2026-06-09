use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use rusqlite::params;
use crate::store;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CaseAnnotations {
    pub case_id: i64,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_case_annotations(app: AppHandle, case_id: i64) -> Result<Option<CaseAnnotations>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn.prepare(
        "SELECT notes, tags, updated_at FROM case_annotations WHERE case_id = ?1"
    ).map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query(params![case_id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let notes: Option<String> = row.get(0).map_err(|e| e.to_string())?;
        let tags_str: Option<String> = row.get(1).map_err(|e| e.to_string())?;
        let updated_at: String = row.get(2).map_err(|e| e.to_string())?;
        
        let tags = tags_str
            .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
            .unwrap_or_default();
            
        Ok(Some(CaseAnnotations {
            case_id,
            notes,
            tags,
            updated_at,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn set_case_annotations(
    app: AppHandle,
    case_id: i64,
    notes: Option<String>,
    tags: Vec<String>,
) -> Result<CaseAnnotations, String> {
    let conn = store::open_db(&app)?;
    let tags_str = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    let updated_at = chrono::Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT OR REPLACE INTO case_annotations (case_id, notes, tags, updated_at) 
         VALUES (?1, ?2, ?3, ?4)",
        params![case_id, notes, tags_str, updated_at],
    ).map_err(|e| format!("[set_case_annotations] {e}"))?;
    
    Ok(CaseAnnotations {
        case_id,
        notes,
        tags,
        updated_at,
    })
}

#[tauri::command]
pub fn delete_case_annotations(app: AppHandle, case_id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute(
        "DELETE FROM case_annotations WHERE case_id = ?1",
        params![case_id],
    ).map_err(|e| format!("[delete_case_annotations] {e}"))?;
    Ok(())
}
