use rusqlite::Connection;
use super::types::DocumentRow;

pub(crate) fn parse_json_vec(s: Option<String>) -> Vec<String> {
    s.and_then(|v| serde_json::from_str::<Vec<String>>(&v).ok())
        .unwrap_or_default()
}

pub(crate) fn clean_json(raw: &str) -> String {
    let s = raw.trim();
    let s = if s.starts_with("```") {
        s.splitn(3, "```").nth(1).unwrap_or(s)
            .trim_start_matches("json").trim()
    } else { s };
    match (s.find('{'), s.rfind('}')) {
        (Some(a), Some(b)) if b > a => s[a..=b].to_string(),
        _ => s.to_string(),
    }
}

pub(crate) fn fts_term(kw: &str) -> String {
    format!("\"{}\"", kw.replace('"', "\"\""))
}

pub(crate) fn row_to_doc(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentRow> {
    Ok(DocumentRow {
        id:          row.get(0)?,
        file_path:   row.get(1)?,
        file_name:   row.get(2)?,
        title:       row.get(3)?,
        summary:     row.get(4)?,
        doc_type:    row.get(5)?,
        doc_date:    row.get(6)?,
        language:    row.get(7)?,
        keywords:    parse_json_vec(row.get(8)?),
        topics:      parse_json_vec(row.get(9)?),
        entities:    parse_json_vec(row.get(10)?),
        authors:     parse_json_vec(row.get(11)?),
        page_count:  row.get(12)?,
        confidence:  row.get(13)?,
    })
}

// Check if any chunk embeddings exist in the database
pub(crate) fn has_embeddings(conn: &Connection) -> bool {
    let count: i64 = conn
        .query_row("SELECT COUNT(1) FROM document_chunks", [], |row| row.get(0))
        .unwrap_or(0);
    count > 0
}
