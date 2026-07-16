use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store;

/// Non-null placeholder for `scope_value` when a tag isn't attached to a specific
/// case/document (e.g. app-identity tags like `username`/`useremail`). SQLite's
/// UNIQUE constraint treats NULL as distinct from NULL, so a real sentinel is
/// needed for upserts to actually collide/update instead of inserting duplicates.
const APP_SCOPE_SENTINEL: &str = "app";

const TAG_COLUMNS: &str = "id, scope_type, scope_value, name, value, type, created_at, updated_at";

#[derive(Debug, Clone)]
pub enum TagScope {
    Case(i64),
    Document(String),
    App,
}

impl TagScope {
    fn scope_type(&self) -> &'static str {
        match self {
            TagScope::Case(_) => "case",
            TagScope::Document(_) => "document",
            TagScope::App => "app",
        }
    }

    fn scope_value(&self) -> String {
        match self {
            TagScope::Case(id) => id.to_string(),
            TagScope::Document(path) => path.replace('\\', "/"),
            TagScope::App => APP_SCOPE_SENTINEL.to_string(),
        }
    }

    /// `scope_value` is a single generic string over IPC (matches the `tags` table's
    /// shape 1:1) — parsed into a typed variant here rather than the command layer
    /// taking separate `case_id`/`file_path` params.
    fn from_parts(scope_type: &str, scope_value: Option<&str>) -> Result<Self, String> {
        match scope_type {
            "case" => {
                let raw = scope_value.ok_or_else(|| "scope_value is required for scope_type 'case'".to_string())?;
                raw.parse::<i64>()
                    .map(TagScope::Case)
                    .map_err(|_| format!("scope_value '{raw}' is not a valid case id"))
            }
            "document" => scope_value
                .map(|p| TagScope::Document(p.to_string()))
                .ok_or_else(|| "scope_value is required for scope_type 'document'".to_string()),
            "app" => Ok(TagScope::App),
            other => Err(format!("Unknown scope_type '{other}'")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TagType {
    User,
    System,
}

impl TagType {
    fn as_str(&self) -> &'static str {
        match self {
            TagType::User => "user",
            TagType::System => "system",
        }
    }

    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "user" => Ok(TagType::User),
            "system" => Ok(TagType::System),
            other => Err(format!("Unknown tag type '{other}'")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub scope_type: String,
    pub scope_value: Option<String>,
    pub name: String,
    pub value: Option<String>,
    #[serde(rename = "type")]
    pub tag_type: String,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_tag(row: &rusqlite::Row) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        scope_type: row.get(1)?,
        scope_value: row.get(2)?,
        name: row.get(3)?,
        value: row.get(4)?,
        tag_type: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

// ── Internal (no IPC) — callable directly by other backend modules to write/read
// system tags (case creation, settings saves, future auto-taggers) without a
// round-trip through the Tauri command layer. ──────────────────────────────────

pub(crate) fn upsert_tag_internal(
    app: &AppHandle,
    scope: TagScope,
    name: &str,
    value: Option<&str>,
    tag_type: TagType,
) -> Result<Tag, String> {
    let conn = store::open_db(app)?;
    let scope_type = scope.scope_type();
    let scope_value = scope.scope_value();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO tags (scope_type, scope_value, name, value, type, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(scope_type, scope_value, name) DO UPDATE SET
            value = excluded.value,
            type = excluded.type,
            updated_at = excluded.updated_at",
        params![scope_type, scope_value, name, value, tag_type.as_str(), now],
    ).map_err(|e| format!("[upsert_tag] {e}"))?;

    conn.query_row(
        &format!("SELECT {TAG_COLUMNS} FROM tags WHERE scope_type = ?1 AND scope_value = ?2 AND name = ?3"),
        params![scope_type, scope_value, name],
        row_to_tag,
    ).map_err(|e| format!("[upsert_tag] {e}"))
}

pub(crate) fn remove_tag_internal(app: &AppHandle, scope: TagScope, name: &str) -> Result<(), String> {
    let conn = store::open_db(app)?;
    conn.execute(
        "DELETE FROM tags WHERE scope_type = ?1 AND scope_value = ?2 AND name = ?3",
        params![scope.scope_type(), scope.scope_value(), name],
    ).map_err(|e| format!("[remove_tag] {e}"))?;
    Ok(())
}

/// Bulk fetch of every tag for a given scope_type (e.g. all case tags in one query),
/// for list views that would otherwise need one query per row.
pub(crate) fn list_all_tags_for_scope_type(app: &AppHandle, scope_type: &str) -> Result<Vec<Tag>, String> {
    let conn = store::open_db(app)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {TAG_COLUMNS} FROM tags WHERE scope_type = ?1"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![scope_type], row_to_tag).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub(crate) fn list_tags_internal(app: &AppHandle, scope: TagScope) -> Result<Vec<Tag>, String> {
    let conn = store::open_db(app)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {TAG_COLUMNS} FROM tags WHERE scope_type = ?1 AND scope_value = ?2 ORDER BY name"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![scope.scope_type(), scope.scope_value()], row_to_tag)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Document-scoped lookup that tolerates inconsistent path formats (exact,
/// slash-normalized, and suffix matches both directions), mirroring the matching
/// already used for `document_annotations`/`documents` elsewhere in this codebase
/// (e.g. `list_case_files`). A plain `list_tags_internal(TagScope::Document(..))`
/// only matches an exact normalized path.
/// Takes an already-open connection since the only caller (`list_case_files`)
/// loops over many files and shouldn't pay for a fresh SQLite connection each time.
pub(crate) fn list_tags_for_document_fuzzy(conn: &rusqlite::Connection, file_path: &str) -> Result<Vec<Tag>, String> {
    let normalized = file_path.replace('\\', "/");
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {TAG_COLUMNS} FROM tags
             WHERE scope_type = 'document' AND (
                scope_value = ?1
                OR scope_value = ?2
                OR (scope_value LIKE '%' || ?2 AND length(?1) > 10)
                OR (?2 LIKE '%' || scope_value AND length(?2) > 10)
             )
             ORDER BY name"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![file_path, normalized], row_to_tag).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Reverse lookup used by tag-driven matching operations (e.g. correlating an
/// incoming email's sender against a case's `useremail` tag).
#[allow(dead_code)]
pub(crate) fn find_by_name_value(app: &AppHandle, name: &str, value: &str) -> Result<Vec<Tag>, String> {
    let conn = store::open_db(app)?;
    let mut stmt = conn
        .prepare(&format!("SELECT {TAG_COLUMNS} FROM tags WHERE name = ?1 AND value = ?2"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![name, value], row_to_tag).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ── Tauri commands ──────────────────────────────────────────────────────────
// `scope_value` mirrors the table's shape 1:1 (one generic string, not separate
// case_id/file_path params) and `tag_type` is caller-supplied rather than
// hardcoded, so this one command layer covers both user tags (frontend edits)
// and system tags (backend generators, or if ever needed, direct frontend use).

#[tauri::command]
pub fn add_tag(
    app: AppHandle,
    scope_type: String,
    scope_value: Option<String>,
    name: String,
    value: Option<String>,
    tag_type: String,
) -> Result<Tag, String> {
    let scope = TagScope::from_parts(&scope_type, scope_value.as_deref())?;
    let parsed_type = TagType::parse(&tag_type)?;
    upsert_tag_internal(&app, scope, &name, value.as_deref(), parsed_type)
}

#[tauri::command]
pub fn update_tag(
    app: AppHandle,
    scope_type: String,
    scope_value: Option<String>,
    name: String,
    value: Option<String>,
    tag_type: String,
) -> Result<Tag, String> {
    add_tag(app, scope_type, scope_value, name, value, tag_type)
}

#[tauri::command]
pub fn remove_tag(
    app: AppHandle,
    scope_type: String,
    scope_value: Option<String>,
    name: String,
) -> Result<(), String> {
    let scope = TagScope::from_parts(&scope_type, scope_value.as_deref())?;
    remove_tag_internal(&app, scope, &name)
}

#[tauri::command]
pub fn list_tags(
    app: AppHandle,
    scope_type: String,
    scope_value: Option<String>,
) -> Result<Vec<Tag>, String> {
    let scope = TagScope::from_parts(&scope_type, scope_value.as_deref())?;
    list_tags_internal(&app, scope)
}

#[tauri::command]
pub fn list_all_tag_names(app: AppHandle, tag_type: Option<String>) -> Result<Vec<String>, String> {
    let conn = store::open_db(&app)?;
    let names = match tag_type {
        Some(t) => {
            let parsed = TagType::parse(&t)?;
            let mut stmt = conn
                .prepare("SELECT DISTINCT name FROM tags WHERE type = ?1 ORDER BY name")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![parsed.as_str()], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
        }
        None => {
            let mut stmt = conn
                .prepare("SELECT DISTINCT name FROM tags ORDER BY name")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
        }
    };
    names.map_err(|e| e.to_string())
}
