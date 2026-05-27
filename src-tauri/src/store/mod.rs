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

pub fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let uri = format!("file:{}?nolock=1", path.to_string_lossy());
    let conn = Connection::open_with_flags(
        uri,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_URI,
    ).map_err(|e| e.to_string())?;
    conn.execute("PRAGMA foreign_keys = ON;", []).map_err(|e| e.to_string())?;
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS cases (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            subject     TEXT,
            status      TEXT    NOT NULL DEFAULT 'open',
            name        TEXT    NOT NULL,
            created_at  TEXT    NOT NULL,
            updated_at  TEXT
        );
    ").map_err(|e| e.to_string())?;
    init_documents_schema(&conn).map_err(|e| format!("[documents schema] {e}"))?;
    init_templates_schema(&conn).map_err(|e| format!("[templates schema] {e}"))?;
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
";

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
    CREATE TABLE IF NOT EXISTS templates (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name     TEXT NOT NULL,
        original_path TEXT NOT NULL UNIQUE,
        marked_path   TEXT NOT NULL,
        file_ext      TEXT NOT NULL,
        file_size_kb  INTEGER,
        fields_found  TEXT,
        uploaded_at   TEXT NOT NULL
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
}

pub fn init_templates_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(TEMPLATES_SCHEMA)
}

pub fn insert_template(conn: &Connection, r: &TemplateRecord) -> Result<i64, rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO templates
            (file_name, original_path, marked_path, file_ext, file_size_kb, fields_found, uploaded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![r.file_name, r.original_path, r.marked_path, r.file_ext, r.file_size_kb, r.fields_found, r.uploaded_at],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_templates(conn: &Connection) -> Result<Vec<TemplateRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, file_name, original_path, marked_path, file_ext, file_size_kb, fields_found, uploaded_at
         FROM templates ORDER BY uploaded_at DESC"
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
    }))?.collect();
    rows
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
