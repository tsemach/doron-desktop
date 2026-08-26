use std::path::Path;
use std::io::{Read, Write};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store;
use crate::tags::{list_all_tags_for_scope_type, list_tags_for_document_fuzzy, upsert_tag_internal, Tag, TagScope, TagType};

pub mod annotations;
pub mod case_text_index;
pub mod documents_link;
pub mod identifiers;
pub mod matcher_backfill;
pub mod lookup;


/// Refresh the matcher's derived indexes after a case's data changed.
///
/// Best-effort by design: a stale index costs match quality, but a failure here must
/// never break the user action that triggered it (saving fields, creating a case).
pub fn refresh_case_matcher_indexes(conn: &rusqlite::Connection, case_id: i64) {
    if let Err(e) = identifiers::rebuild_case_identifiers(conn, case_id) {
        eprintln!("[case matcher] identifier rebuild failed for case {case_id}: {e}");
    }
    if let Err(e) = case_text_index::rebuild_case_text_fts(conn, case_id) {
        eprintln!("[case matcher] text index rebuild failed for case {case_id}: {e}");
    }
}

pub use annotations::*;
pub use lookup::*;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Case {
    pub id: i64,
    pub subject: Option<String>,
    pub status: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub folder: Option<String>,
    pub notes: Option<String>,
    pub tags: Vec<Tag>,
}

/// Returned by `create_new_case`. Case creation itself never depends on the outcome of
/// linking `contact_emails` (design.md §7) -- any per-email failure is collected here as a
/// human-readable warning instead of failing the whole command.
///
/// `case` is `#[serde(flatten)]`ed so the JSON response still has `id`/`subject`/`name`/etc.
/// at the top level, with `contact_warnings` as an additional sibling key -- this keeps the
/// existing frontend caller (`CaseManagementCaseCreate.tsx`, not yet updated for this new
/// wrapper) working unchanged: it reads `createdCase.id` etc. directly and simply ignores
/// the unfamiliar extra `contact_warnings` key until a later PR starts reading it.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CreateCaseResult {
    #[serde(flatten)]
    pub case: Case,
    pub contact_warnings: Vec<String>,
}

#[tauri::command]
pub fn list_cases(app: AppHandle) -> Result<Vec<Case>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("
            SELECT c.id, c.subject, c.status, c.name, c.created_at, c.updated_at, c.folder, ca.notes
            FROM cases c
            LEFT JOIN case_annotations ca ON c.id = ca.case_id
            WHERE c.deleted = 0 OR c.deleted IS NULL
            ORDER BY c.id DESC
        ")
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
            notes: row.get(7)?,
            tags: Vec::new(),
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }

    // Bulk-attach tags (one query for all cases instead of one per case).
    let all_case_tags = list_all_tags_for_scope_type(&app, "case")?;
    for case in list.iter_mut() {
        let case_id_str = case.id.to_string();
        case.tags = all_case_tags
            .iter()
            .filter(|t| t.scope_value.as_deref() == Some(case_id_str.as_str()))
            .cloned()
            .collect();
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
    let case_id_tag = upsert_tag_internal(&app, TagScope::Case(id), "case_id", Some(&id.to_string()), TagType::System)?;
    Ok(Case { id, subject: Some(subject), status, name, created_at, updated_at: None, folder, notes: None, tags: vec![case_id_tag] })
}

#[tauri::command]
pub async fn create_new_case(
    app: AppHandle,
    subject: String,
    name: String,
    folder: String,
    case_template_id: Option<i64>,
    task_template_id: Option<i64>,
    tasks: Option<Vec<store::NewTaskInput>>,
    field_values: std::collections::HashMap<String, String>,
    contact_emails: Option<Vec<String>>,
) -> Result<CreateCaseResult, String> {
    // `Option` (not a bare `Vec`) so Tauri defaults a missing `contactEmails` IPC key to
    // `None` instead of erroring -- required so the existing frontend caller, which does not
    // yet send this key, keeps working unchanged until a later PR wires it up.
    let contact_emails = contact_emails.unwrap_or_default();

    // The case row, its fields/tasks, and any template documents are all synchronous
    // DB/filesystem/ZIP work -- run on the blocking pool so it doesn't stall every
    // other in-flight command while it runs. Only the best-effort contact-linking
    // loop below (which awaits its own async command) stays on the async side.
    let mut result = crate::blocking::run_blocking({
        let app = app.clone();
        move || {
            create_new_case_blocking(
                app,
                subject,
                name,
                folder,
                case_template_id,
                task_template_id,
                tasks,
                field_values,
            )
        }
    }).await?;

    // Create/link a contact for each supplied client email (design.md §4.4). Case creation
    // itself has already succeeded above and must never roll back over this -- each failure
    // (create or link) is collected as a warning instead of propagated with `?`. Empty/
    // whitespace-only entries are skipped silently: the frontend caller is expected to have
    // already trimmed/filtered, but this is a public command surface, so defend here too.
    for email in &contact_emails {
        let email = email.trim();
        if email.is_empty() {
            continue;
        }
        match crate::contact::create_contact(app.clone(), None, email.to_string(), None, None, None, None).await {
            Ok(contact) => {
                if let Err(e) =
                    crate::contact::add_contact_to_case(app.clone(), result.case.id, contact.id, "case_creation".to_string())
                {
                    result.contact_warnings.push(format!("Could not add contact for {email}: {e}"));
                }
            }
            Err(e) => {
                result.contact_warnings.push(format!("Could not add contact for {email}: {e}"));
            }
        }
    }

    Ok(result)
}

fn create_new_case_blocking(
    app: AppHandle,
    subject: String,
    name: String,
    folder: String,
    case_template_id: Option<i64>,
    task_template_id: Option<i64>,
    tasks: Option<Vec<store::NewTaskInput>>,
    field_values: std::collections::HashMap<String, String>,
) -> Result<CreateCaseResult, String> {
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
    let case_id_tag = upsert_tag_internal(&app, TagScope::Case(id), "case_id", Some(&id.to_string()), TagType::System)?;

    // Save fields to case_fields
    for (key, val) in &field_values {
        conn.execute(
            "INSERT OR REPLACE INTO case_fields (case_id, field_name, field_value) VALUES (?1, ?2, ?3)",
            params![id, key, val],
        ).map_err(|e| format!("[insert case field] {e}"))?;
    }

    refresh_case_matcher_indexes(&conn, id);

    // If the caller reviewed/edited a task template's tasks before submitting
    // (the case-creation UI's task review panel), those explicit tasks take
    // priority over blindly materializing the template as-is.
    if let Some(task_inputs) = &tasks {
        store::create_tasks_for_new_case(&conn, id, &created_at, task_inputs)
            .map_err(|e| format!("[create tasks] {e}"))?;
    } else if let Some(tt_id) = task_template_id {
        store::materialize_tasks_from_template(&conn, id, tt_id, &created_at)
            .map_err(|e| format!("[materialize tasks] {e}"))?;
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

            if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("Original Version".to_string()), true, true) {
                println!("Failed to create document version backup on create_new_case: {}", e);
            }
        }
    }

    Ok(CreateCaseResult {
        case: Case {
            id,
            subject: Some(subject),
            status: "open".to_string(),
            name,
            created_at,
            updated_at: None,
            folder: Some(folder),
            notes: None,
            tags: vec![case_id_tag],
        },
        contact_warnings: Vec::new(),
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

#[tauri::command]
pub fn update_case_status(app: AppHandle, id: i64, status: String) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    let updated_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE cases SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, updated_at, id],
    ).map_err(|e| format!("[update case status] {e}"))?;
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
    pub tags: Vec<Tag>,
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

                // 3. Query notes from document_annotations
                let notes: Option<String> = conn.query_row(
                    "SELECT notes FROM document_annotations
                     WHERE file_path = ?1
                        OR REPLACE(file_path, '\\', '/') = ?2
                        OR (REPLACE(file_path, '\\', '/') LIKE '%' || ?2 AND length(file_path) > 10)
                        OR (?2 LIKE '%' || REPLACE(file_path, '\\', '/') AND length(?2) > 10)",
                    params![path_str, normalized_path],
                    |row| row.get(0)
                ).unwrap_or(None);

                let tags = list_tags_for_document_fuzzy(&conn, &path_str).unwrap_or_default();

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
    pub updated_at: String,
}

#[tauri::command]
pub fn get_document_annotations(app: AppHandle, file_path: String) -> Result<Option<DocumentAnnotations>, String> {
    let conn = store::open_db(&app)?;
    let normalized = file_path.replace('\\', "/");
    let mut stmt = conn.prepare(
        "SELECT notes, updated_at FROM document_annotations
         WHERE file_path = ?1 OR REPLACE(file_path, '\\', '/') = ?2"
    ).map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![file_path, normalized]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let notes: Option<String> = row.get(0).map_err(|e| e.to_string())?;
        let updated_at: String = row.get(1).map_err(|e| e.to_string())?;

        Ok(Some(DocumentAnnotations {
            file_path,
            notes,
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
) -> Result<DocumentAnnotations, String> {
    let conn = store::open_db(&app)?;
    let updated_at = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO document_annotations (file_path, notes, updated_at)
         VALUES (?1, ?2, ?3)",
        params![file_path, notes, updated_at],
    ).map_err(|e| format!("[set_document_annotations] {e}"))?;

    Ok(DocumentAnnotations {
        file_path,
        notes,
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
    } else {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("Original Version".to_string()), true, true) {
            println!("Failed to create document version backup on add (new file): {}", e);
        }
    }

    // Index it: this is what makes the document searchable and what links it to the case.
    // Without it the file shows in the folder listing and nowhere else — invisible to
    // search and to the email matcher's Tier B.
    crate::indexer::index_case_file_in_background(&app, dest_path.to_string_lossy().to_string());

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
    refresh_case_matcher_indexes(&conn, case_id);
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

#[tauri::command]
pub async fn save_case_document_fields(
    app: AppHandle,
    case_id: i64,
    file_name: String,
    fields: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    // Entirely synchronous SQLite + filesystem + ZIP work -- run on the blocking
    // pool so it doesn't stall every other in-flight command while it runs.
    crate::blocking::run_blocking(move || {
        save_case_document_fields_blocking(app, case_id, file_name, fields)
    }).await
}

fn save_case_document_fields_blocking(
    app: AppHandle,
    case_id: i64,
    file_name: String,
    fields: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use tauri::Emitter;

    // 1. Open DB first
    let conn = store::open_db(&app)?;

    // 2. Save fields to case_fields
    for (key, val) in &fields {
        conn.execute(
            "INSERT OR REPLACE INTO case_fields (case_id, field_name, field_value) VALUES (?1, ?2, ?3)",
            params![case_id, key, val],
        ).map_err(|e| format!("[save_case_document_fields] {e}"))?;
    }

    // 3. Load all fields for this case to merge them
    let mut all_fields = std::collections::HashMap::new();
    let mut stmt = conn
        .prepare("SELECT field_name, field_value FROM case_fields WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![case_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for r in rows {
        if let Ok((name, val)) = r {
            all_fields.insert(name, val);
        }
    }

    // 4. Find the template path for this file name
    let mut doc_stmt = conn
        .prepare("SELECT marked_path, file_ext FROM doc_templates WHERE file_name = ?1")
        .map_err(|e| e.to_string())?;
    let (marked_path_str, file_ext): (String, String) = doc_stmt
        .query_row(params![file_name], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| format!("Failed to find doc template with file_name {file_name}: {e}"))?;

    // 5. Get folder path for the case
    let folder_path: String = conn.query_row(
        "SELECT folder FROM cases WHERE id = ?1",
        params![case_id],
        |row| row.get(0)
    ).map_err(|e| format!("Failed to find case: {e}"))?;

    let dest_path = Path::new(&folder_path).join(&file_name);

    // 6. Create version backup of the active file before overwriting (if it exists)
    if dest_path.exists() {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(
            &app,
            &dest_path,
            Some("State before document fields update".to_string()),
            true,
            false,
        ) {
            println!("Failed to create document version backup before update: {}", e);
        }
    }

    // 7. Regenerate the file from template with updated merged fields
    let marked_path = Path::new(&marked_path_str);
    if !marked_path.exists() {
        return Err(format!("Template file not found at {marked_path_str}"));
    }

    if file_ext == "docx" {
        let original_bytes = std::fs::read(marked_path)
            .map_err(|e| format!("Failed to read marked docx: {e}"))?;

        let cursor = std::io::Cursor::new(original_bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Cannot open marked docx ZIP: {e}"))?;

        let doc_xml = {
            let mut f = archive
                .by_name("word/document.xml")
                .map_err(|_| "word/document.xml not found".to_string())?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            s
        };

        let mut new_doc_xml = doc_xml;
        new_doc_xml = crate::doc_template::replace_docx_placeholders(&new_doc_xml, &all_fields);

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
        let mut text = std::fs::read_to_string(marked_path)
            .map_err(|e| format!("Failed to read marked text template: {e}"))?;

        for (key, val) in &all_fields {
            text = text.replace(&format!("[[{key}]]"), val);
        }

        std::fs::write(&dest_path, text)
            .map_err(|e| format!("Failed to write generated text: {e}"))?;
    }

    // 8. Emit change notification to frontend
    let _ = app.emit("case-files-changed", ());

    Ok(())
}

#[cfg(test)]
mod create_case_result_tests {
    use super::*;

    /// The existing frontend caller (`CaseManagementCaseCreate.tsx`, not yet updated for
    /// `CreateCaseResult`) reads `createdCase.id`/`.name`/etc. directly off the top-level
    /// IPC response. `#[serde(flatten)]` on `CreateCaseResult::case` must keep those keys at
    /// the top level -- not nested under a `case` key -- or that existing read breaks at
    /// runtime the moment this PR merges, even though it never changed.
    #[test]
    fn create_case_result_flattens_case_fields_to_top_level() {
        let result = CreateCaseResult {
            case: Case {
                id: 1,
                subject: Some("s".to_string()),
                status: "open".to_string(),
                name: "n".to_string(),
                created_at: "2026-01-01T00:00:00+00:00".to_string(),
                updated_at: None,
                folder: Some("/tmp/x".to_string()),
                notes: None,
                tags: vec![],
            },
            contact_warnings: vec!["warn".to_string()],
        };

        let json = serde_json::to_value(&result).unwrap();

        assert_eq!(json.get("id").and_then(|v| v.as_i64()), Some(1));
        assert_eq!(json.get("name").and_then(|v| v.as_str()), Some("n"));
        assert_eq!(json.get("status").and_then(|v| v.as_str()), Some("open"));
        assert!(
            json.get("case").is_none(),
            "Case fields must be flattened to the top level, not nested under a `case` key"
        );
        assert_eq!(
            json.get("contact_warnings").and_then(|v| v.as_array()).map(|a| a.len()),
            Some(1),
            "contact_warnings must still be present as a sibling key"
        );
    }
}



