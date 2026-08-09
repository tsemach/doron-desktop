pub mod matcher_schema;

use chrono::Utc;
use rusqlite::{Connection, OpenFlags, params};
use serde::Serialize;
use tauri::{AppHandle, Manager};

// ── DB connection ─────────────────────────────────────────────────────────────

pub fn db_path(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("documents.db")
}

pub fn cli_app_data_dir() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            return std::path::PathBuf::from(local_app_data).join("com.tsemach.doron-desktop");
        }
    }
    // WSL / Linux / macOS fallback
    if let Ok(home) = std::env::var("HOME") {
        return std::path::PathBuf::from(home).join(".local/share/com.tsemach.doron-desktop");
    }
    std::path::PathBuf::from(".")
}

pub fn cli_db_path(name: &str) -> std::path::PathBuf {
    cli_app_data_dir().join(name)
}

pub fn open_db(app: &AppHandle) -> Result<Connection, String> {
    open_db_by_path(&db_path(app))
}

pub fn open_db_by_path(path: &std::path::Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let mut conn = None;
    let mut last_err = String::new();
    
    for _ in 0..5 {
        match Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
        ) {
            Ok(c) => {
                // Set journal mode to DELETE to avoid WAL shared-memory mapping failures on DrvFs /mnt/c/ mounts in WSL 2
                // Note: PRAGMA journal_mode returns a row, so we use query_row instead of execute.
                if let Err(e) = c.query_row("PRAGMA journal_mode = DELETE;", [], |_| Ok(())) {
                    eprintln!("Warning: PRAGMA journal_mode = DELETE failed: {}", e);
                }
                let _ = c.execute("PRAGMA busy_timeout = 5000;", []);
                if let Err(e) = c.execute("PRAGMA foreign_keys = ON;", []) {
                    last_err = format!("Failed to set foreign keys: {}", e);
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    continue;
                }
                conn = Some(c);
                break;
            }
            Err(e) => {
                last_err = e.to_string();
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    }
    
    let conn = conn.ok_or_else(|| format!("Failed to open database after retries: {}", last_err))?;
    
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS cases (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            subject     TEXT,
            status      TEXT    NOT NULL DEFAULT 'open',
            name        TEXT    NOT NULL,
            created_at  TEXT    NOT NULL,
            updated_at  TEXT,
            folder      TEXT,
            deleted     INTEGER DEFAULT 0
        );
    ").map_err(|e| e.to_string())?;

    // Ensure 'folder' column exists in 'cases'
    let folder_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('cases') WHERE name='folder'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if !folder_exists {
        let _ = conn.execute("ALTER TABLE cases ADD COLUMN folder TEXT;", []);
    }

    // Ensure 'deleted' column exists in 'cases'
    let deleted_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('cases') WHERE name='deleted'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if !deleted_exists {
        let _ = conn.execute("ALTER TABLE cases ADD COLUMN deleted INTEGER DEFAULT 0;", []);
    }

    // Migrate templates to doc_templates if necessary
    let templates_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='templates'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;

    let doc_templates_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='doc_templates'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;

    if templates_exists && !doc_templates_exists {
        let _ = conn.execute("ALTER TABLE templates RENAME TO doc_templates;", []);
    }

    init_documents_schema(&conn).map_err(|e| format!("[documents schema] {e}"))?;
    init_templates_schema(&conn).map_err(|e| format!("[templates schema] {e}"))?;
    crate::documents::versioning::init_version_schema(&conn).map_err(|e| format!("[versioning schema] {e}"))?;

    // Ensure 'title' column exists in 'doc_templates'
    let title_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('doc_templates') WHERE name='title'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if !title_exists {
        let _ = conn.execute("ALTER TABLE doc_templates ADD COLUMN title TEXT;", []);
    }

    conn.execute_batch(CASE_TEMPLATES_SCHEMA).map_err(|e| format!("[case templates schema] {e}"))?;

    // Drop task_template_items if it still has the pre-estimate_value/estimate_unit
    // shape (estimate_time INTEGER). That column layout only ever existed in local
    // dev databases during this feature's own development, before this table shipped
    // anywhere -- CREATE TABLE IF NOT EXISTS won't fix an already-existing table with
    // the old columns, and there's no real data to preserve, so recreate it fresh.
    let task_template_items_stale: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('task_template_items') WHERE name='estimate_time'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if task_template_items_stale {
        let _ = conn.execute("DROP TABLE task_template_items;", []);
    }

    conn.execute_batch(TASK_TEMPLATES_SCHEMA).map_err(|e| format!("[task templates schema] {e}"))?;

    conn.execute_batch(TASKS_SCHEMA).map_err(|e| format!("[tasks schema] {e}"))?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS document_annotations (
            file_path   TEXT PRIMARY KEY,
            notes       TEXT,
            updated_at  TEXT  NOT NULL
        );
    ").map_err(|e| format!("[annotations schema] {e}"))?;

    // Drop the legacy 'tags' column now that tags live in the 'tags' table (pre-production, no data migration needed)
    let document_annotations_tags_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('document_annotations') WHERE name='tags'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if document_annotations_tags_exists {
        let _ = conn.execute("ALTER TABLE document_annotations DROP COLUMN tags;", []);
    }

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS case_annotations (
            case_id     INTEGER PRIMARY KEY,
            notes       TEXT,
            updated_at  TEXT  NOT NULL,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );
    ").map_err(|e| format!("[case annotations schema] {e}"))?;

    // Drop the legacy 'tags'/'followup_date' columns now that tags (including 'followup') live
    // in the 'tags' table (pre-production, no data migration needed)
    let case_annotations_tags_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('case_annotations') WHERE name='tags'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if case_annotations_tags_exists {
        let _ = conn.execute("ALTER TABLE case_annotations DROP COLUMN tags;", []);
    }
    let case_annotations_followup_date_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('case_annotations') WHERE name='followup_date'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if case_annotations_followup_date_exists {
        let _ = conn.execute("ALTER TABLE case_annotations DROP COLUMN followup_date;", []);
    }

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS case_fields (
            case_id      INTEGER NOT NULL,
            field_name   TEXT NOT NULL,
            field_value  TEXT NOT NULL,
            PRIMARY KEY (case_id, field_name),
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );
    ").map_err(|e| format!("[case_fields schema] {e}"))?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS tags (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            scope_type  TEXT NOT NULL CHECK (scope_type IN ('case','document','app')),
            scope_value TEXT,
            name        TEXT NOT NULL,
            value       TEXT,
            type        TEXT NOT NULL CHECK (type IN ('user','system')),
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            UNIQUE(scope_type, scope_value, name)
        );

        CREATE INDEX IF NOT EXISTS idx_tags_lookup ON tags(name, value);
        CREATE INDEX IF NOT EXISTS idx_tags_scope ON tags(scope_type, scope_value);

        -- 'cases' rows are only ever soft-deleted (see delete_case), so no cascade trigger
        -- is needed there. 'documents' rows ARE hard-deleted, so cascade their tags here.
        -- scope_value is always stored slash-normalized (see TagScope::Document), so
        -- old.file_path must be normalized the same way or the match can silently miss.
        CREATE TRIGGER IF NOT EXISTS tags_document_cascade AFTER DELETE ON documents BEGIN
            DELETE FROM tags WHERE scope_type = 'document' AND scope_value = REPLACE(old.file_path, '\', '/');
        END;

        CREATE TABLE IF NOT EXISTS user_settings (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            username  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS auth_session (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            token       TEXT NOT NULL,
            email       TEXT NOT NULL,
            tier        TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            backend_url TEXT NOT NULL DEFAULT '',
            role        TEXT NOT NULL DEFAULT 'flat',
            firm_id     TEXT
        );
    ").map_err(|e| format!("[tags schema] {e}"))?;

    // Ensure 'backend_url'/'role'/'firm_id' columns exist in 'auth_session'
    // for pre-existing installs (base CREATE TABLE above only takes effect
    // for fresh DBs). backend_url lets internal callers that only have an
    // AppHandle -- indexer, query analysis, field extraction, cloud
    // transcribe -- reach the backend for online-mode AI requests via
    // auth::get_backend_url. role/firm_id (ASC-142) mirror the backend's
    // users.role/firmId onto the locally cached session.
    for (column, add_column_sql) in [
        ("backend_url", "ALTER TABLE auth_session ADD COLUMN backend_url TEXT NOT NULL DEFAULT '';"),
        ("role", "ALTER TABLE auth_session ADD COLUMN role TEXT NOT NULL DEFAULT 'flat';"),
        ("firm_id", "ALTER TABLE auth_session ADD COLUMN firm_id TEXT;"),
    ] {
        let column_exists: bool = conn.query_row(
            "SELECT COUNT(1) FROM pragma_table_info('auth_session') WHERE name=?1",
            params![column],
            |row| row.get(0)
        ).unwrap_or(0) > 0;
        if !column_exists {
            let _ = conn.execute(add_column_sql, []);
        }
    }

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS email_configurations (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            imap_server   TEXT NOT NULL,
            imap_port     INTEGER NOT NULL,
            username      TEXT NOT NULL,
            password_enc  TEXT NOT NULL,
            provider      TEXT NOT NULL DEFAULT 'claude',
            api_key_enc   TEXT
        );

        CREATE TABLE IF NOT EXISTS case_emails (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id          INTEGER NOT NULL,
            message_id       TEXT UNIQUE,
            sender           TEXT NOT NULL,
            recipient        TEXT NOT NULL,
            subject          TEXT NOT NULL,
            body_text        TEXT,
            body_html        TEXT,
            direction        TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
            received_at      TEXT NOT NULL,
            attachments_json TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pending_email_alerts (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id    TEXT UNIQUE,
            sender        TEXT NOT NULL,
            subject       TEXT NOT NULL,
            body_snippet  TEXT NOT NULL,
            body_text     TEXT,
            received_at   TEXT NOT NULL,
            suggested_case_id INTEGER,
            confidence    REAL,
            reason        TEXT,
            attachments_json TEXT
        );

        CREATE TABLE IF NOT EXISTS ignored_emails (
            message_id    TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS ai_configurations (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            ai_mode       TEXT,
            provider      TEXT NOT NULL DEFAULT 'claude',
            ai_model      TEXT NOT NULL DEFAULT '',
            api_key_enc   TEXT
        );
    ").map_err(|e| format!("[emails schema] {e}"))?;

    // Ensure 'body_text' column exists in 'pending_email_alerts' for migration
    let body_text_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('pending_email_alerts') WHERE name='body_text'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if !body_text_exists {
        let _ = conn.execute("ALTER TABLE pending_email_alerts ADD COLUMN body_text TEXT;", []);
    }

    // Ensure 'voice_engine' column exists in 'ai_configurations' — independent of ai_mode,
    // since a user's chat-LLM provider choice doesn't imply the same preference for voice
    // transcription (e.g. local chat + cloud STT, or vice versa, are both reasonable).
    let voice_engine_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('ai_configurations') WHERE name='voice_engine'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if !voice_engine_exists {
        let _ = conn.execute("ALTER TABLE ai_configurations ADD COLUMN voice_engine TEXT NOT NULL DEFAULT 'local';", []);
    }

    // Which whisper model to use when voice_engine == 'local'.
    let voice_model_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('ai_configurations') WHERE name='voice_model'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if !voice_model_exists {
        let _ = conn.execute("ALTER TABLE ai_configurations ADD COLUMN voice_model TEXT NOT NULL DEFAULT 'whisper multilingual (small)';", []);
    }

    // Cloud provider + API key dedicated to voice input (transcription AND
    // field extraction when voice_engine == 'cloud') — independent of the
    // main ai_mode/provider/api_key_enc, so a user can keep chat on local
    // while still using a cloud provider for voice, without switching their
    // main AI Provider setting.
    let voice_cloud_provider_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('ai_configurations') WHERE name='voice_cloud_provider'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if !voice_cloud_provider_exists {
        let _ = conn.execute("ALTER TABLE ai_configurations ADD COLUMN voice_cloud_provider TEXT NOT NULL DEFAULT 'gemini';", []);
    }

    let voice_cloud_api_key_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('ai_configurations') WHERE name='voice_cloud_api_key'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if !voice_cloud_api_key_exists {
        let _ = conn.execute("ALTER TABLE ai_configurations ADD COLUMN voice_cloud_api_key TEXT NOT NULL DEFAULT '';", []);
    }

    let voice_cloud_model_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('ai_configurations') WHERE name='voice_cloud_model'",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;
    if !voice_cloud_model_exists {
        let _ = conn.execute("ALTER TABLE ai_configurations ADD COLUMN voice_cloud_model TEXT NOT NULL DEFAULT 'gemini-3.5-flash';", []);
    }

    // Migrate old AI configuration to the new ai_configurations table if new table is empty
    let has_ai_config: bool = conn.query_row(
        "SELECT COUNT(1) FROM ai_configurations",
        [],
        |row| row.get(0)
    ).unwrap_or(0) > 0;

    if !has_ai_config {
        if let Ok(mut stmt) = conn.prepare("SELECT provider, api_key_enc FROM email_configurations LIMIT 1") {
            let row = stmt.query_row([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?
                ))
            });
            if let Ok((old_provider, old_key)) = row {
                let _ = conn.execute(
                    "INSERT INTO ai_configurations (ai_mode, provider, ai_model, api_key_enc) VALUES ('byom', ?1, '', ?2)",
                    params![old_provider, old_key],
                );
            }
        }
    }

    // Clean up forwarded headers from existing case_emails
    if let Ok(mut stmt) = conn.prepare("SELECT id, body_text FROM case_emails") {
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?)));
        if let Ok(rows) = rows {
            for row in rows.flatten() {
                let (id, body_text) = row;
                if let Some(body) = body_text {
                    let cleaned = crate::email::strip_forward_headers(&body);
                    if cleaned != body {
                        let _ = conn.execute(
                            "UPDATE case_emails SET body_text = ?1 WHERE id = ?2",
                            params![cleaned, id],
                        );
                        println!("[DB Migration] Stripped forward headers for case email ID {}", id);
                    }
                }
            }
        }
    }

    // Convert existing received_at dates in case_emails and pending_email_alerts to standard RFC3339
    if let Ok(mut stmt) = conn.prepare("SELECT id, received_at FROM case_emails") {
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)));
        if let Ok(rows) = rows {
            for row in rows.flatten() {
                let (id, received_at) = row;
                if let Ok(dt) = chrono::DateTime::parse_from_rfc2822(received_at.trim()) {
                    let rfc3339 = dt.to_rfc3339();
                    let _ = conn.execute(
                        "UPDATE case_emails SET received_at = ?1 WHERE id = ?2",
                        params![rfc3339, id],
                    );
                }
            }
        }
    }

    if let Ok(mut stmt) = conn.prepare("SELECT id, received_at FROM pending_email_alerts") {
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)));
        if let Ok(rows) = rows {
            for row in rows.flatten() {
                let (id, received_at) = row;
                if let Ok(dt) = chrono::DateTime::parse_from_rfc2822(received_at.trim()) {
                    let rfc3339 = dt.to_rfc3339();
                    let _ = conn.execute(
                        "UPDATE pending_email_alerts SET received_at = ?1 WHERE id = ?2",
                        params![rfc3339, id],
                    );
                }
            }
        }
    }

    // Last: the matcher schema adds a column to `documents` and references `cases`,
    // `case_emails` and `pending_email_alerts`, all of which are created above.
    matcher_schema::init_matcher_schema(&conn)
        .map_err(|e| format!("[case matcher schema] {e}"))?;

    Ok(conn)
}

#[tauri::command]
pub fn get_db_path(app: AppHandle) -> String {
    db_path(&app).to_string_lossy().to_string()
}

const DOCUMENTS_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS documents (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path       TEXT    NOT NULL UNIQUE,
        file_name       TEXT    NOT NULL,
        file_ext        TEXT    NOT NULL,
        file_size_kb    INTEGER,
        doc_type        TEXT,
        title           TEXT,
        summary         TEXT,
        authors         TEXT,
        doc_date        TEXT,
        topics          TEXT,
        entities        TEXT,
        keywords        TEXT,
        language        TEXT,
        page_count      INTEGER,
        confidence      REAL,
        indexed_at      TEXT    NOT NULL,
        raw_metadata    TEXT,
        raw_text        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_doc_type ON documents(doc_type);
    CREATE INDEX IF NOT EXISTS idx_language  ON documents(language);
    CREATE INDEX IF NOT EXISTS idx_doc_date  ON documents(doc_date);
    CREATE INDEX IF NOT EXISTS idx_title     ON documents(title);

    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        title, summary, authors, topics, entities, keywords, raw_text,
        content='documents', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, summary, authors, topics, entities, keywords, raw_text)
        VALUES (new.id, new.title, new.summary, new.authors, new.topics, new.entities, new.keywords, new.raw_text);
    END;

    CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, summary, authors, topics, entities, keywords, raw_text)
        VALUES ('delete', old.id, old.title, old.summary, old.authors, old.topics, old.entities, old.keywords, old.raw_text);
    END;

    CREATE TABLE IF NOT EXISTS document_chunks (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id     INTEGER NOT NULL,
        chunk_index     INTEGER NOT NULL,
        text            TEXT    NOT NULL,
        embedding       BLOB    NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks(document_id);

    CREATE TABLE IF NOT EXISTS active_indexing_sessions (
        path          TEXT PRIMARY KEY,
        is_folder     INTEGER NOT NULL,
        reindex       INTEGER NOT NULL,
        start_index   INTEGER NOT NULL,
        total_files   INTEGER NOT NULL,
        status        TEXT NOT NULL,
        updated_at    TEXT NOT NULL
    );
";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct IndexingSession {
    pub path: String,
    pub is_folder: bool,
    pub reindex: bool,
    pub start_index: usize,
    pub total_files: usize,
    pub status: String,
    pub updated_at: String,
}

pub fn save_indexing_session(
    conn: &Connection,
    session: &IndexingSession,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO active_indexing_sessions (path, is_folder, reindex, start_index, total_files, status, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            session.path,
            if session.is_folder { 1 } else { 0 },
            if session.reindex { 1 } else { 0 },
            session.start_index as i64,
            session.total_files as i64,
            session.status,
            session.updated_at
        ],
    )?;
    Ok(())
}

pub fn get_active_indexing_sessions(conn: &Connection) -> Result<Vec<IndexingSession>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT path, is_folder, reindex, start_index, total_files, status, updated_at FROM active_indexing_sessions")?;
    let rows = stmt.query_map([], |row| {
        let is_folder: i32 = row.get(1)?;
        let reindex: i32 = row.get(2)?;
        let start_index: i64 = row.get(3)?;
        let total_files: i64 = row.get(4)?;
        Ok(IndexingSession {
            path: row.get(0)?,
            is_folder: is_folder != 0,
            reindex: reindex != 0,
            start_index: start_index as usize,
            total_files: total_files as usize,
            status: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;

    let mut sessions = Vec::new();
    for r in rows {
        sessions.push(r?);
    }
    Ok(sessions)
}

pub fn delete_indexing_session(conn: &Connection, path: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM active_indexing_sessions WHERE path = ?1", params![path])?;
    Ok(())
}

pub struct DocumentRecord {
    pub file_path: String,
    pub file_name: String,
    pub file_ext: String,
    pub file_size_kb: i64,
    pub doc_type: Option<String>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub authors: String,
    pub doc_date: Option<String>,
    pub topics: String,
    pub entities: String,
    pub keywords: String,
    pub language: Option<String>,
    pub page_count: Option<i32>,
    pub confidence: Option<f64>,
    pub raw_metadata: String,
    pub raw_text: String,
}

pub fn init_documents_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(DOCUMENTS_SCHEMA)
}

pub fn is_already_indexed(conn: &Connection, file_path: &str) -> Result<bool, rusqlite::Error> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(1) FROM documents WHERE file_path = ?1",
        params![file_path],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS doc_templates (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name     TEXT NOT NULL,
        original_path TEXT NOT NULL UNIQUE,
        marked_path   TEXT NOT NULL,
        file_ext      TEXT NOT NULL,
        file_size_kb  INTEGER,
        fields_found  TEXT,
        uploaded_at   TEXT NOT NULL,
        title         TEXT
    );
";

pub struct TemplateRecord {
    pub file_name: String,
    pub original_path: String,
    pub marked_path: String,
    pub file_ext: String,
    pub file_size_kb: i64,
    pub fields_found: String,
    pub uploaded_at: String,
    pub title: Option<String>,
}

#[derive(Serialize)]
pub struct TemplateRow {
    pub id: i64,
    pub file_name: String,
    pub original_path: String,
    pub marked_path: String,
    pub file_ext: String,
    pub file_size_kb: i64,
    pub fields_found: String,
    pub uploaded_at: String,
    pub title: Option<String>,
}

pub fn init_templates_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(TEMPLATES_SCHEMA)
}

pub fn insert_template(conn: &Connection, r: &TemplateRecord) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO doc_templates
            (file_name, original_path, marked_path, file_ext, file_size_kb, fields_found, uploaded_at, title)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![r.file_name, r.original_path, r.marked_path, r.file_ext, r.file_size_kb, r.fields_found, r.uploaded_at, r.title],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_templates(conn: &Connection) -> Result<Vec<TemplateRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT 
            dt.id, 
            dt.file_name, 
            dt.original_path, 
            dt.marked_path, 
            dt.file_ext, 
            dt.file_size_kb, 
            dt.fields_found, 
            dt.uploaded_at,
            dt.title
         FROM doc_templates dt
         ORDER BY dt.uploaded_at DESC"
    )?;
    let rows = stmt.query_map([], |row| Ok(TemplateRow {
        id:            row.get(0)?,
        file_name:     row.get(1)?,
        original_path: row.get(2)?,
        marked_path:   row.get(3)?,
        file_ext:      row.get(4)?,
        file_size_kb:  row.get(5)?,
        fields_found:  row.get(6).unwrap_or_default(),
        uploaded_at:   row.get(7)?,
        title:         row.get(8).ok(),
    }))?.collect();
    rows
}

// ── Case Templates ─────────────────────────────────────────────────────────────

const CASE_TEMPLATES_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS case_templates (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        fields      TEXT    NOT NULL, -- JSON array of field names
        created_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS case_template_docs (
        case_template_id  INTEGER NOT NULL,
        template_id       INTEGER NOT NULL,
        PRIMARY KEY (case_template_id, template_id),
        FOREIGN KEY (case_template_id) REFERENCES case_templates(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES doc_templates(id) ON DELETE CASCADE
    );
";

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct CaseTemplateRow {
    pub id: i64,
    pub name: String,
    pub fields: String, // JSON array string
    pub created_at: String,
    pub doc_template_ids: Vec<i64>,
}

pub fn create_case_template(
    conn: &Connection,
    name: &str,
    fields: &[String],
    doc_template_ids: &[i64],
) -> Result<i64, rusqlite::Error> {
    let fields_json = serde_json::to_string(fields).unwrap_or_else(|_| "[]".to_string());
    let created_at = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO case_templates (name, fields, created_at) VALUES (?1, ?2, ?3)",
        params![name, fields_json, created_at],
    )?;
    let case_template_id = conn.last_insert_rowid();

    for &doc_id in doc_template_ids {
        conn.execute(
            "INSERT INTO case_template_docs (case_template_id, template_id) VALUES (?1, ?2)",
            params![case_template_id, doc_id],
        )?;
    }

    Ok(case_template_id)
}

pub fn list_case_templates(conn: &Connection) -> Result<Vec<CaseTemplateRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, fields, created_at FROM case_templates ORDER BY name ASC"
    )?;
    let rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let fields: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        Ok((id, name, fields, created_at))
    })?;

    let mut templates = Vec::new();
    for r in rows {
        let (id, name, fields_json, created_at) = r?;
        let mut doc_stmt = conn.prepare(
            "SELECT template_id FROM case_template_docs WHERE case_template_id = ?1"
        )?;
        let doc_ids: Vec<i64> = doc_stmt
            .query_map(params![id], |row| row.get(0))?
            .collect::<Result<Vec<i64>, _>>()?;

        // DYNAMICALLY MERGE FIELDS IN RUST
        let mut merged_fields: Vec<String> = serde_json::from_str(&fields_json).unwrap_or_default();
        for &doc_id in &doc_ids {
            let mut fields_stmt = conn.prepare(
                "SELECT fields_found FROM doc_templates WHERE id = ?1"
            )?;
            if let Ok(fields_found_json) = fields_stmt.query_row(params![doc_id], |row| row.get::<_, String>(0)) {
                if let Ok(fields_found) = serde_json::from_str::<Vec<String>>(&fields_found_json) {
                    for f in fields_found {
                        if !merged_fields.contains(&f) {
                            merged_fields.push(f);
                        }
                    }
                }
            }
        }
        let merged_fields_json = serde_json::to_string(&merged_fields).unwrap_or_else(|_| "[]".to_string());

        templates.push(CaseTemplateRow {
            id,
            name,
            fields: merged_fields_json,
            created_at,
            doc_template_ids: doc_ids,
        });
    }

    Ok(templates)
}

pub fn update_case_template(
    conn: &Connection,
    id: i64,
    name: &str,
    fields: &[String],
    doc_template_ids: &[i64],
) -> Result<(), rusqlite::Error> {
    let fields_json = serde_json::to_string(fields).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "UPDATE case_templates SET name = ?1, fields = ?2 WHERE id = ?3",
        params![name, fields_json, id],
    )?;

    conn.execute(
        "DELETE FROM case_template_docs WHERE case_template_id = ?1",
        params![id],
    )?;

    for &doc_id in doc_template_ids {
        conn.execute(
            "INSERT INTO case_template_docs (case_template_id, template_id) VALUES (?1, ?2)",
            params![id, doc_id],
        )?;
    }

    Ok(())
}

pub fn delete_case_template(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM case_templates WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

// ── Task Templates ────────────────────────────────────────────────────────────

const TASK_TEMPLATES_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS task_templates (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        created_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_template_items (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        task_template_id  INTEGER NOT NULL,
        title             TEXT    NOT NULL,
        estimate_value    REAL    NOT NULL,
        estimate_unit     TEXT    NOT NULL CHECK (estimate_unit IN ('day','hour')),
        description       TEXT,
        sort_order        INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (task_template_id) REFERENCES task_templates(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_task_template_items_template ON task_template_items(task_template_id);
";

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct TaskTemplateItemRow {
    pub id: i64,
    pub title: String,
    pub estimate_value: f64,
    pub estimate_unit: String,
    pub description: Option<String>,
}

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct TaskTemplateRow {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub items: Vec<TaskTemplateItemRow>,
}

#[derive(serde::Deserialize, Clone)]
pub struct TaskTemplateItemInput {
    pub title: String,
    pub estimate_value: f64,
    pub estimate_unit: String,
    pub description: Option<String>,
}

pub fn create_task_template(
    conn: &Connection,
    name: &str,
    items: &[TaskTemplateItemInput],
) -> Result<i64, rusqlite::Error> {
    let created_at = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO task_templates (name, created_at) VALUES (?1, ?2)",
        params![name, created_at],
    )?;
    let task_template_id = conn.last_insert_rowid();

    for (idx, item) in items.iter().enumerate() {
        conn.execute(
            "INSERT INTO task_template_items (task_template_id, title, estimate_value, estimate_unit, description, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![task_template_id, item.title, item.estimate_value, item.estimate_unit, item.description, idx as i64],
        )?;
    }

    Ok(task_template_id)
}

fn list_task_template_items(conn: &Connection, task_template_id: i64) -> Result<Vec<TaskTemplateItemRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, title, estimate_value, estimate_unit, description FROM task_template_items
         WHERE task_template_id = ?1 ORDER BY sort_order ASC"
    )?;
    let rows = stmt.query_map(params![task_template_id], |row| {
        Ok(TaskTemplateItemRow {
            id: row.get(0)?,
            title: row.get(1)?,
            estimate_value: row.get(2)?,
            estimate_unit: row.get(3)?,
            description: row.get(4)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn list_task_templates(conn: &Connection) -> Result<Vec<TaskTemplateRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at FROM task_templates ORDER BY name ASC"
    )?;
    let rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let created_at: String = row.get(2)?;
        Ok((id, name, created_at))
    })?;

    let mut templates = Vec::new();
    for r in rows {
        let (id, name, created_at) = r?;
        let items = list_task_template_items(conn, id)?;
        templates.push(TaskTemplateRow { id, name, created_at, items });
    }

    Ok(templates)
}

pub fn update_task_template(
    conn: &Connection,
    id: i64,
    name: &str,
    items: &[TaskTemplateItemInput],
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE task_templates SET name = ?1 WHERE id = ?2",
        params![name, id],
    )?;

    conn.execute(
        "DELETE FROM task_template_items WHERE task_template_id = ?1",
        params![id],
    )?;

    for (idx, item) in items.iter().enumerate() {
        conn.execute(
            "INSERT INTO task_template_items (task_template_id, title, estimate_value, estimate_unit, description, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, item.title, item.estimate_value, item.estimate_unit, item.description, idx as i64],
        )?;
    }

    Ok(())
}

pub fn delete_task_template(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM task_templates WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

const TASKS_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS tasks (
        id                     INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id                INTEGER NOT NULL,
        title                  TEXT    NOT NULL,
        description            TEXT,
        status                 TEXT    NOT NULL DEFAULT 'Waiting'
                                       CHECK (status IN ('Waiting','In progress','Cancel','Done')),
        estimate_value         REAL,
        estimate_unit          TEXT    CHECK (estimate_unit IS NULL OR estimate_unit IN ('day','hour')),
        due_date               TEXT,
        task_template_item_id  INTEGER,
        created_at             TEXT    NOT NULL,
        updated_at             TEXT,
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (task_template_item_id) REFERENCES task_template_items(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_case_id  ON tasks(case_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
";

/// Computes a due_date timestamp from a base (usually the case's created_at)
/// plus an estimate, converted to minutes (a "day" estimate is treated as
/// 24h) since estimates may be fractional (e.g. 0.5 day) or already
/// hour-granular. Shared by template materialization and explicit ad-hoc
/// task creation so both compute due dates identically.
fn compute_due_date_from_estimate(base_iso: &str, estimate_value: f64, estimate_unit: &str) -> String {
    let base = chrono::DateTime::parse_from_rfc3339(base_iso)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());
    let value_in_hours = if estimate_unit == "day" { estimate_value * 24.0 } else { estimate_value };
    (base + chrono::Duration::minutes((value_in_hours * 60.0).round() as i64)).to_rfc3339()
}

/// Materializes a task_template's items into concrete `tasks` rows for a newly
/// created case, unedited. Used when the caller passes a task_template_id with
/// no explicit `tasks` override (see `create_tasks_for_new_case` for the
/// user-reviewed/edited path, which takes priority when both are given).
pub fn materialize_tasks_from_template(
    conn: &Connection,
    case_id: i64,
    task_template_id: i64,
    case_created_at: &str,
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, title, estimate_value, estimate_unit, description FROM task_template_items
         WHERE task_template_id = ?1 ORDER BY sort_order ASC"
    )?;
    let items: Vec<(i64, String, f64, String, Option<String>)> = stmt
        .query_map(params![task_template_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let now = chrono::Utc::now().to_rfc3339();

    for (item_id, title, estimate_value, estimate_unit, description) in items {
        let due_date = compute_due_date_from_estimate(case_created_at, estimate_value, &estimate_unit);

        conn.execute(
            "INSERT INTO tasks (case_id, title, description, status, estimate_value, estimate_unit, due_date, task_template_item_id, created_at)
             VALUES (?1, ?2, ?3, 'Waiting', ?4, ?5, ?6, ?7, ?8)",
            params![case_id, title, description, estimate_value, estimate_unit, due_date, item_id, now],
        )?;
    }

    Ok(())
}

#[derive(serde::Deserialize, Clone)]
pub struct NewTaskInput {
    pub title: String,
    pub description: Option<String>,
    pub estimate_value: Option<f64>,
    pub estimate_unit: Option<String>,
    // Set when this draft originated from a task_template_item the user
    // reviewed/edited in the case-creation UI, kept for traceability; None
    // for a task typed from scratch (not currently offered in that UI, but
    // the column and this input both already support it).
    pub template_item_id: Option<i64>,
}

/// Inserts explicit, already-reviewed task drafts for a newly created case
/// (the case-creation UI's task review panel lets the user uncheck/edit a
/// task template's items before the case exists) -- see `NewTaskInput`.
pub fn create_tasks_for_new_case(
    conn: &Connection,
    case_id: i64,
    case_created_at: &str,
    tasks: &[NewTaskInput],
) -> Result<(), rusqlite::Error> {
    let now = chrono::Utc::now().to_rfc3339();

    for t in tasks {
        let due_date = match (t.estimate_value, t.estimate_unit.as_deref()) {
            (Some(value), Some(unit)) => Some(compute_due_date_from_estimate(case_created_at, value, unit)),
            _ => None,
        };

        conn.execute(
            "INSERT INTO tasks (case_id, title, description, status, estimate_value, estimate_unit, due_date, task_template_item_id, created_at)
             VALUES (?1, ?2, ?3, 'Waiting', ?4, ?5, ?6, ?7, ?8)",
            params![case_id, t.title, t.description, t.estimate_value, t.estimate_unit, due_date, t.template_item_id, now],
        )?;
    }

    Ok(())
}

#[derive(Serialize, serde::Deserialize, Clone)]
pub struct TaskRow {
    pub id: i64,
    pub case_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub estimate_value: Option<f64>,
    pub estimate_unit: Option<String>,
    pub due_date: Option<String>,
    pub task_template_item_id: Option<i64>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

fn task_row_from_sql(row: &rusqlite::Row) -> rusqlite::Result<TaskRow> {
    Ok(TaskRow {
        id: row.get(0)?,
        case_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        status: row.get(4)?,
        estimate_value: row.get(5)?,
        estimate_unit: row.get(6)?,
        due_date: row.get(7)?,
        task_template_item_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub fn list_tasks_for_case(conn: &Connection, case_id: i64) -> Result<Vec<TaskRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, case_id, title, description, status, estimate_value, estimate_unit, due_date, task_template_item_id, created_at, updated_at
         FROM tasks WHERE case_id = ?1 ORDER BY (due_date IS NULL), due_date ASC, id ASC"
    )?;
    let rows = stmt.query_map(params![case_id], task_row_from_sql)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn create_task(
    conn: &Connection,
    case_id: i64,
    title: &str,
    description: Option<&str>,
    estimate_value: Option<f64>,
    estimate_unit: Option<&str>,
    due_date: Option<&str>,
) -> Result<TaskRow, rusqlite::Error> {
    let created_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO tasks (case_id, title, description, status, estimate_value, estimate_unit, due_date, created_at)
         VALUES (?1, ?2, ?3, 'Waiting', ?4, ?5, ?6, ?7)",
        params![case_id, title, description, estimate_value, estimate_unit, due_date, created_at],
    )?;
    let id = conn.last_insert_rowid();
    Ok(TaskRow {
        id,
        case_id,
        title: title.to_string(),
        description: description.map(|s| s.to_string()),
        status: "Waiting".to_string(),
        estimate_value,
        estimate_unit: estimate_unit.map(|s| s.to_string()),
        due_date: due_date.map(|s| s.to_string()),
        task_template_item_id: None,
        created_at,
        updated_at: None,
    })
}

pub fn update_task(
    conn: &Connection,
    id: i64,
    title: &str,
    description: Option<&str>,
    estimate_value: Option<f64>,
    estimate_unit: Option<&str>,
    due_date: Option<&str>,
    status: &str,
) -> Result<(), rusqlite::Error> {
    let updated_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE tasks SET title = ?1, description = ?2, estimate_value = ?3, estimate_unit = ?4, due_date = ?5, status = ?6, updated_at = ?7
         WHERE id = ?8",
        params![title, description, estimate_value, estimate_unit, due_date, status, updated_at, id],
    )?;
    Ok(())
}

pub fn update_task_status(conn: &Connection, id: i64, status: &str) -> Result<(), rusqlite::Error> {
    let updated_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE tasks SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, updated_at, id],
    )?;
    Ok(())
}

pub fn delete_task(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct TaskWithCaseRow {
    #[serde(flatten)]
    pub task: TaskRow,
    pub case_subject: Option<String>,
    pub case_name: String,
}

/// Cross-case task list for the dashboard. Mirrors `list_cases`'s join style
/// (store/mod.rs `list_cases`): joins in the owning case and excludes soft-deleted
/// cases the same way.
pub fn list_all_tasks(conn: &Connection) -> Result<Vec<TaskWithCaseRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.case_id, t.title, t.description, t.status, t.estimate_value, t.estimate_unit,
                t.due_date, t.task_template_item_id, t.created_at, t.updated_at, c.subject, c.name
         FROM tasks t
         JOIN cases c ON t.case_id = c.id
         WHERE c.deleted = 0 OR c.deleted IS NULL
         ORDER BY (t.due_date IS NULL), t.due_date ASC, t.id ASC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TaskWithCaseRow {
            task: TaskRow {
                id: row.get(0)?,
                case_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                status: row.get(4)?,
                estimate_value: row.get(5)?,
                estimate_unit: row.get(6)?,
                due_date: row.get(7)?,
                task_template_item_id: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            },
            case_subject: row.get(11)?,
            case_name: row.get(12)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

// ── Documents ─────────────────────────────────────────────────────────────────

pub fn insert_document(conn: &Connection, record: &DocumentRecord) -> Result<(), rusqlite::Error> {
    let indexed_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO documents
            (file_path, file_name, file_ext, file_size_kb, doc_type, title, summary,
             authors, doc_date, topics, entities, keywords, language, page_count,
             confidence, indexed_at, raw_metadata, raw_text)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
        params![
            record.file_path,
            record.file_name,
            record.file_ext,
            record.file_size_kb,
            record.doc_type,
            record.title,
            record.summary,
            record.authors,
            record.doc_date,
            record.topics,
            record.entities,
            record.keywords,
            record.language,
            record.page_count,
            record.confidence,
            indexed_at,
            record.raw_metadata,
            record.raw_text,
        ],
    )?;
    Ok(())
}

pub fn insert_document_chunk(
    conn: &Connection,
    doc_id: i64,
    chunk_index: i32,
    text: &str,
    embedding: &[u8],
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO document_chunks (document_id, chunk_index, text, embedding)
         VALUES (?1, ?2, ?3, ?4)",
        params![doc_id, chunk_index, text, embedding],
    )?;
    Ok(())
}

pub fn delete_document_chunks(conn: &Connection, doc_id: i64) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM document_chunks WHERE document_id = ?1", params![doc_id])?;
    Ok(())
}

pub fn delete_document_by_path(conn: &Connection, file_path: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM documents WHERE file_path = ?1", params![file_path])?;
    Ok(())
}

pub fn get_document_id_by_path(conn: &Connection, file_path: &str) -> Result<Option<i64>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT id FROM documents WHERE file_path = ?1")?;
    let mut rows = stmt.query(params![file_path])?;
    if let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        Ok(Some(id))
    } else {
        Ok(None)
    }
}
