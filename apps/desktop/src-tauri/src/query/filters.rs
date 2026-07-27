use std::collections::HashSet;

use rusqlite::Connection;

use super::types::TagFilter;

/// Document IDs passing hard filters (date range, tags, notes-contains).
pub fn filtered_document_ids(
    conn: &Connection,
    date_from: Option<&str>,
    date_to: Option<&str>,
    tags: Option<&[TagFilter]>,
    notes_contains: Option<&str>,
) -> Option<HashSet<i64>> {
    let mut clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(df) = date_from {
        if !df.trim().is_empty() {
            clauses.push(format!("doc_date >= ?{}", params.len() + 1));
            params.push(Box::new(df.to_string()));
        }
    }

    if let Some(dt) = date_to {
        if !dt.trim().is_empty() {
            clauses.push(format!("doc_date <= ?{}", params.len() + 1));
            params.push(Box::new(dt.to_string()));
        }
    }

    for tag in tags.into_iter().flatten() {
        let name = tag.name.trim();
        if name.is_empty() {
            continue;
        }
        match tag.value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            Some(value) => {
                clauses.push(format!(
                    "REPLACE(file_path, '\\', '/') IN (SELECT scope_value FROM tags WHERE scope_type = 'document' AND name = ?{} AND value = ?{})",
                    params.len() + 1,
                    params.len() + 2
                ));
                params.push(Box::new(name.to_string()));
                params.push(Box::new(value.to_string()));
            }
            None => {
                clauses.push(format!(
                    "REPLACE(file_path, '\\', '/') IN (SELECT scope_value FROM tags WHERE scope_type = 'document' AND name = ?{})",
                    params.len() + 1
                ));
                params.push(Box::new(name.to_string()));
            }
        }
    }

    if let Some(notes) = notes_contains.map(str::trim).filter(|n| !n.is_empty()) {
        clauses.push(format!(
            "file_path IN (SELECT file_path FROM document_annotations WHERE notes LIKE ?{})",
            params.len() + 1
        ));
        params.push(Box::new(format!("%{}%", notes)));
    }

    if clauses.is_empty() {
        return None;
    }

    let sql = format!("SELECT id FROM documents WHERE {}", clauses.join(" AND "));
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Some(HashSet::new()),
    };

    let p_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|v| v.as_ref()).collect();
    let rows = stmt
        .query_map(p_ref.as_slice(), |row| row.get::<_, i64>(0))
        .ok();

    let mut set = HashSet::new();
    if let Some(rows) = rows {
        for r in rows.flatten() {
            set.insert(r);
        }
    }
    Some(set)
}
