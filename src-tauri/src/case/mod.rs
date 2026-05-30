use std::path::Path;
use std::io::{Read, Write};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store;
use crate::doc_template::xml_escape;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Case {
    pub id: i64,
    pub subject: Option<String>,
    pub status: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub folder: Option<String>,
}

#[tauri::command]
pub fn list_cases(app: AppHandle) -> Result<Vec<Case>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, subject, status, name, created_at, updated_at, folder FROM cases WHERE deleted = 0 OR deleted IS NULL ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(Case {
            id: row.get(0)?,
            subject: row.get(1)?,
            status: row.get(2)?,
            name: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            folder: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
pub fn add_case(
    app: AppHandle,
    subject: String,
    status: String,
    name: String,
    created_at: String,
    folder: Option<String>,
) -> Result<Case, String> {
    let conn = store::open_db(&app)?;
    conn.execute(
        "INSERT INTO cases (subject, status, name, created_at, folder) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![subject, status, name, created_at, folder],
    ).map_err(|e| format!("[insert case] {e}"))?;
    let id = conn.last_insert_rowid();
    Ok(Case { id, subject: Some(subject), status, name, created_at, updated_at: None, folder })
}

#[tauri::command]
pub async fn create_new_case(
    app: AppHandle,
    subject: String,
    name: String,
    folder: String,
    case_template_id: Option<i64>,
    field_values: std::collections::HashMap<String, String>,
) -> Result<Case, String> {
    // 1. Open DB first and verify that this folder path is not already in use by another active case
    let conn = store::open_db(&app)?;
    let folder_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM cases WHERE folder = ?1 AND (deleted = 0 OR deleted IS NULL)",
        params![folder],
        |row| row.get(0)
    ).unwrap_or(0) > 0;

    if folder_exists {
        return Err("A case with this storage directory path already exists.".to_string());
    }

    // 2. Create case directory
    let case_path = Path::new(&folder);
    std::fs::create_dir_all(case_path)
        .map_err(|e| format!("Failed to create case directory: {e}"))?;

    // 3. Insert case record
    let created_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO cases (subject, status, name, created_at, folder) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![subject, "open", name, created_at, folder],
    ).map_err(|e| format!("[insert case] {e}"))?;
    let id = conn.last_insert_rowid();

    // 3. If a template is chosen, copy then fill documents
    if let Some(ct_id) = case_template_id {
        // Find document template IDs associated with the case template
        let mut stmt = conn
            .prepare("SELECT template_id FROM case_template_docs WHERE case_template_id = ?1")
            .map_err(|e| e.to_string())?;
        
        let doc_ids: Vec<i64> = stmt
            .query_map(params![ct_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<i64>, _>>()
            .map_err(|e| e.to_string())?;

        for doc_id in doc_ids {
            // Get template document details
            let mut doc_stmt = conn
                .prepare("SELECT marked_path, file_name, file_ext FROM doc_templates WHERE id = ?1")
                .map_err(|e| e.to_string())?;
            
            let (marked_path_str, file_name, file_ext): (String, String, String) = doc_stmt
                .query_row(params![doc_id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .map_err(|e| format!("Failed to find doc template with ID {doc_id}: {e}"))?;

            let marked_path = Path::new(&marked_path_str);
            if !marked_path.exists() {
                return Err(format!("Template file not found at {marked_path_str}"));
            }

            // Destination filename without .marked (we use original file_name)
            let dest_path = case_path.join(&file_name);

            // Copy marked template file first
            std::fs::copy(marked_path, &dest_path)
                .map_err(|e| format!("Failed to copy template to {}: {e}", dest_path.display()))?;

            // Replace field values in-place on the copied file
            if file_ext == "docx" {
                let original_bytes = std::fs::read(&dest_path)
                    .map_err(|e| format!("Failed to read copied docx: {e}"))?;

                let cursor = std::io::Cursor::new(original_bytes);
                let mut archive = zip::ZipArchive::new(cursor)
                    .map_err(|e| format!("Cannot open copied docx ZIP: {e}"))?;

                let doc_xml = {
                    let mut f = archive
                        .by_name("word/document.xml")
                        .map_err(|_| "word/document.xml not found".to_string())?;
                    let mut s = String::new();
                    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                    s
                };

                let mut new_doc_xml = doc_xml;
                new_doc_xml = crate::doc_template::replace_docx_placeholders(&new_doc_xml, &field_values);

                let out_buf: Vec<u8> = Vec::new();
                let out_cursor = std::io::Cursor::new(out_buf);
                let mut new_zip = zip::ZipWriter::new(out_cursor);

                for i in 0..archive.len() {
                    let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
                    let name = file.name().to_string();
                    let opts = zip::write::FileOptions::<()>::default()
                        .compression_method(file.compression());

                    if file.is_dir() {
                        new_zip.add_directory(&name, opts).map_err(|e| e.to_string())?;
                    } else {
                        new_zip.start_file(&name, opts).map_err(|e| e.to_string())?;
                        if name == "word/document.xml" {
                            new_zip
                                .write_all(new_doc_xml.as_bytes())
                                .map_err(|e| e.to_string())?;
                        } else {
                            let mut content = Vec::new();
                            file.read_to_end(&mut content).map_err(|e| e.to_string())?;
                            new_zip.write_all(&content).map_err(|e| e.to_string())?;
                        }
                    }
                }

                let out_cursor = new_zip.finish().map_err(|e| e.to_string())?;
                let output_bytes = out_cursor.into_inner();

                std::fs::write(&dest_path, &output_bytes)
                    .map_err(|e| format!("Failed to write generated DOCX: {e}"))?;
            } else {
                let mut text = std::fs::read_to_string(&dest_path)
                    .map_err(|e| format!("Failed to read copied text template: {e}"))?;

                for (key, val) in &field_values {
                    text = text.replace(&format!("[[{key}]]"), val);
                }

                std::fs::write(&dest_path, text)
                    .map_err(|e| format!("Failed to write generated text: {e}"))?;
            }
        }
    }

    Ok(Case {
        id,
        subject: Some(subject),
        status: "open".to_string(),
        name,
        created_at,
        updated_at: None,
        folder: Some(folder),
    })
}

#[tauri::command]
pub fn delete_case(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute(
        "UPDATE cases SET deleted = 1 WHERE id = ?1",
        params![id],
    ).map_err(|e| format!("[delete case] {e}"))?;
    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CaseFile {
    pub name: String,
    pub path: String,
    pub ext: String,
    pub size_kb: i64,
    pub title: Option<String>,
}

#[tauri::command]
pub fn list_case_files(app: AppHandle, folder_path: String) -> Result<Vec<CaseFile>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() {
        return Err("Directory does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let conn = store::open_db(&app)?;

    let entries = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {e}"))?;

    let mut files = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let p = entry.path();
            if p.is_file() {
                let name = p.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                
                // Skip hidden files
                if name.starts_with('.') {
                    continue;
                }

                let ext = p.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                
                let size_kb = std::fs::metadata(&p)
                    .map(|m| m.len() as i64 / 1024)
                    .unwrap_or(0);

                let path_str = p.to_string_lossy().to_string();
                let normalized_path = path_str.replace('\\', "/");
                
                // 1. Try to find the title in the indexed documents (supporting slash normalization and suffix matches)
                let mut title: Option<String> = conn.query_row(
                    "SELECT title FROM documents 
                     WHERE REPLACE(file_path, '\\', '/') = ?1 
                        OR (REPLACE(file_path, '\\', '/') LIKE '%' || ?1 AND length(file_path) > 10)
                        OR (?1 LIKE '%' || REPLACE(file_path, '\\', '/') AND length(?1) > 10)",
                    params![normalized_path],
                    |row| row.get(0)
                ).ok();

                // 2. Fall back to matching template name in doc_templates
                if title.is_none() || title.as_deref().unwrap_or("").trim().is_empty() {
                    let temp_title: Option<String> = conn.query_row(
                        "SELECT title FROM doc_templates WHERE file_name = ?1",
                        params![name],
                        |row| row.get(0)
                    ).ok();
                    if temp_title.is_some() && !temp_title.as_deref().unwrap_or("").trim().is_empty() {
                        title = temp_title;
                    }
                }

                files.push(CaseFile {
                    name,
                    path: path_str,
                    ext,
                    size_kb,
                    title,
                });
            }
        }
    }
    
    // Sort files by name
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    
    Ok(files)
}

#[tauri::command]
pub fn verify_folder_in_use(app: AppHandle, folder_path: String) -> Result<bool, String> {
    let conn = store::open_db(&app)?;
    let normalized = folder_path.replace('\\', "/");
    let folder_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM cases 
         WHERE (deleted = 0 OR deleted IS NULL) 
           AND (
               REPLACE(folder, '\\', '/') = ?1
               OR REPLACE(folder, '\\', '/') = ?1 || '/'
               OR ?1 = REPLACE(folder, '\\', '/') || '/'
           )",
        params![normalized],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    Ok(folder_exists)
}
