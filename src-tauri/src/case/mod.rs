use std::path::Path;
use std::io::{Read, Write};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store;

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

    // Save fields to case_fields
    for (key, val) in &field_values {
        conn.execute(
            "INSERT OR REPLACE INTO case_fields (case_id, field_name, field_value) VALUES (?1, ?2, ?3)",
            params![id, key, val],
        ).map_err(|e| format!("[insert case field] {e}"))?;
    }

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
    pub notes: Option<String>,
    pub tags: Vec<String>,
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
                
                // Skip hidden files and Microsoft Word temporary files
                if name.starts_with('.') || name.starts_with("~$") {
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

                // 3. Query notes and tags from document_annotations
                let (notes, tags): (Option<String>, Vec<String>) = conn.query_row(
                    "SELECT notes, tags FROM document_annotations 
                     WHERE file_path = ?1 
                        OR REPLACE(file_path, '\\', '/') = ?2
                        OR (REPLACE(file_path, '\\', '/') LIKE '%' || ?2 AND length(file_path) > 10)
                        OR (?2 LIKE '%' || REPLACE(file_path, '\\', '/') AND length(?2) > 10)",
                    params![path_str, normalized_path],
                    |row| {
                        let notes: Option<String> = row.get(0)?;
                        let tags_str: Option<String> = row.get(1)?;
                        let tags = tags_str
                            .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
                            .unwrap_or_default();
                        Ok((notes, tags))
                    }
                ).unwrap_or((None, Vec::new()));

                files.push(CaseFile {
                    name,
                    path: path_str,
                    ext,
                    size_kb,
                    title,
                    notes,
                    tags,
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DocumentAnnotations {
    pub file_path: String,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_document_annotations(app: AppHandle, file_path: String) -> Result<Option<DocumentAnnotations>, String> {
    let conn = store::open_db(&app)?;
    let normalized = file_path.replace('\\', "/");
    let mut stmt = conn.prepare(
        "SELECT notes, tags, updated_at FROM document_annotations 
         WHERE file_path = ?1 OR REPLACE(file_path, '\\', '/') = ?2"
    ).map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query(params![file_path, normalized]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let notes: Option<String> = row.get(0).map_err(|e| e.to_string())?;
        let tags_str: Option<String> = row.get(1).map_err(|e| e.to_string())?;
        let updated_at: String = row.get(2).map_err(|e| e.to_string())?;
        
        let tags = tags_str
            .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
            .unwrap_or_default();
            
        Ok(Some(DocumentAnnotations {
            file_path,
            notes,
            tags,
            updated_at,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn set_document_annotations(
    app: AppHandle,
    file_path: String,
    notes: Option<String>,
    tags: Vec<String>,
) -> Result<DocumentAnnotations, String> {
    let conn = store::open_db(&app)?;
    let tags_str = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    let updated_at = chrono::Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT OR REPLACE INTO document_annotations (file_path, notes, tags, updated_at) 
         VALUES (?1, ?2, ?3, ?4)",
        params![file_path, notes, tags_str, updated_at],
    ).map_err(|e| format!("[set_document_annotations] {e}"))?;
    
    Ok(DocumentAnnotations {
        file_path,
        notes,
        tags,
        updated_at,
    })
}

#[tauri::command]
pub fn delete_document_annotations(app: AppHandle, file_path: String) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    let normalized = file_path.replace('\\', "/");
    conn.execute(
        "DELETE FROM document_annotations 
         WHERE file_path = ?1 OR REPLACE(file_path, '\\', '/') = ?2",
        params![file_path, normalized],
    ).map_err(|e| format!("[delete_document_annotations] {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn list_all_annotation_tags(app: AppHandle) -> Result<Vec<String>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn.prepare("SELECT tags FROM document_annotations")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let tags_str: Option<String> = row.get(0)?;
        Ok(tags_str)
    }).map_err(|e| e.to_string())?;
    
    let mut all_tags = std::collections::HashSet::new();
    for r in rows {
        if let Ok(Some(tags_str)) = r {
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(&tags_str) {
                for tag in tags {
                    if !tag.trim().is_empty() {
                        all_tags.insert(tag);
                    }
                }
            }
        }
    }
    
    let mut sorted_tags: Vec<String> = all_tags.into_iter().collect();
    sorted_tags.sort();
    Ok(sorted_tags)
}

#[tauri::command]
pub fn add_file_to_case(
    app: AppHandle,
    case_folder: String,
    source_path: String,
) -> Result<String, String> {
    let src = Path::new(&source_path);
    if !src.exists() {
        return Err("Source file does not exist".to_string());
    }
    if !src.is_file() {
        return Err("Source path is not a file".to_string());
    }

    let dest_dir = Path::new(&case_folder);
    if !dest_dir.exists() {
        return Err("Case directory does not exist".to_string());
    }

    let file_name = src.file_name()
        .ok_or_else(|| "Invalid source file name".to_string())?;
    
    let dest_path = dest_dir.join(file_name);
    
    let dest_exists = dest_path.exists();

    // Create backup version if file already exists (before overwriting)
    if dest_exists {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("State before update".to_string()), true, false) {
            println!("Failed to create document version backup on add: {}", e);
        }
    }

    // Copy the file to the case folder
    std::fs::copy(src, &dest_path)
        .map_err(|e| format!("Failed to copy file to case directory: {e}"))?;

    // Create version backup immediately if we overwrote an existing file
    if dest_exists {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("Updated from attachment".to_string()), true, false) {
            println!("Failed to create document version backup on add: {}", e);
        }
    }

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_case_fields(
    app: AppHandle,
    case_id: i64,
) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT field_name, field_value FROM case_fields WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![case_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut fields = std::collections::HashMap::new();
    for r in rows {
        if let Ok((name, val)) = r {
            fields.insert(name, val);
        }
    }
    println!("get_case_fields for case_id {}: {:?}", case_id, fields);
    Ok(fields)
}

#[tauri::command]
pub fn save_case_fields(
    app: AppHandle,
    case_id: i64,
    fields: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    println!("save_case_fields for case_id {}: {:?}", case_id, fields);
    let conn = store::open_db(&app)?;
    for (key, val) in fields {
        conn.execute(
            "INSERT OR REPLACE INTO case_fields (case_id, field_name, field_value) VALUES (?1, ?2, ?3)",
            params![case_id, key, val],
        ).map_err(|e| format!("[save_case_fields] {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_file_from_case(
    app: AppHandle,
    case_id: i64,
    file_name: String,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;

    // 1. Get folder path for the case
    let folder_path: String = conn.query_row(
        "SELECT folder FROM cases WHERE id = ?1",
        params![case_id],
        |row| row.get(0)
    ).map_err(|e| format!("Failed to find case: {e}"))?;

    let file_path = Path::new(&folder_path).join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();
    let normalized_file_path = file_path_str.replace('\\', "/");

    // 2. Query fields defined in the template matching the file name being deleted
    let deleted_fields: Vec<String> = match conn.query_row(
        "SELECT fields_found FROM doc_templates WHERE file_name = ?1",
        params![file_name],
        |row| row.get::<_, String>(0)
    ) {
        Ok(fields_json) => {
            serde_json::from_str(&fields_json).unwrap_or_default()
        }
        Err(_) => Vec::new(),
    };

    // 3. Physically delete the file from disk if it exists
    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete file from disk: {e}"))?;
    }

    // Delete all version files from disk and records from DB
    if let Ok(mut stmt) = conn.prepare(
        "SELECT version_path FROM document_versions 
         WHERE active_path = ?1 OR REPLACE(active_path, '\\', '/') = ?2"
    ) {
        if let Ok(rows) = stmt.query_map(params![file_path_str, normalized_file_path], |row| row.get::<_, String>(0)) {
            for r in rows {
                if let Ok(vp) = r {
                    let path = std::path::Path::new(&vp);
                    if path.exists() {
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        }
    }
    
    let _ = conn.execute(
        "DELETE FROM document_versions WHERE active_path = ?1 OR REPLACE(active_path, '\\', '/') = ?2",
        params![file_path_str, normalized_file_path],
    );

    // 4. Delete document-specific DB entries (annotations and FTS/metadata index)
    let _ = conn.execute(
        "DELETE FROM document_annotations WHERE file_path = ?1 OR REPLACE(file_path, '\\', '/') = ?2",
        params![file_path_str, normalized_file_path],
    );

    let _ = conn.execute(
        "DELETE FROM documents WHERE file_path = ?1 OR REPLACE(file_path, '\\', '/') = ?2",
        params![file_path_str, normalized_file_path],
    );

    // 5. Clean up case fields that are no longer used by any other document in the case folder
    if !deleted_fields.is_empty() {
        let mut remaining_fields = std::collections::HashSet::new();
        if let Ok(entries) = std::fs::read_dir(&folder_path) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let p = entry.path();
                    if p.is_file() {
                        let name = p.file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("");
                        
                        // Skip hidden and Word temp files
                        if name.starts_with('.') || name.starts_with("~$") {
                            continue;
                        }

                        // Get fields found for this remaining template
                        if let Ok(fields_json) = conn.query_row(
                            "SELECT fields_found FROM doc_templates WHERE file_name = ?1",
                            params![name],
                            |row| row.get::<_, String>(0)
                        ) {
                            if let Ok(fields) = serde_json::from_str::<Vec<String>>(&fields_json) {
                                for field in fields {
                                    remaining_fields.insert(field);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Delete from case_fields where case_id = case_id AND field_name NOT IN remaining_fields
        for field in deleted_fields {
            if !remaining_fields.contains(&field) {
                let _ = conn.execute(
                    "DELETE FROM case_fields WHERE case_id = ?1 AND field_name = ?2",
                    params![case_id, field],
                );
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read file from disk: {e}"))
}


