use std::collections::HashMap;

use rusqlite::Connection;
use strsim::jaro_winkler;

pub struct SearchableDocFields {
    pub file_name: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub keywords: Vec<String>,
}

impl SearchableDocFields {
    pub fn searchable_text(&self) -> String {
        let mut parts = vec![self.file_name.clone()];
        if let Some(title) = &self.title {
            parts.push(title.clone());
        }
        if let Some(summary) = &self.summary {
            parts.push(summary.clone());
        }
        if !self.keywords.is_empty() {
            parts.push(self.keywords.join(" "));
        }
        parts.join(" ")
    }
}

fn parse_json_vec(s: Option<String>) -> Vec<String> {
    s.and_then(|v| serde_json::from_str::<Vec<String>>(&v).ok())
        .unwrap_or_default()
}

pub struct DocFields {
    pub searchable: SearchableDocFields,
    pub doc_type: Option<String>,
}

fn row_to_searchable(row: &rusqlite::Row<'_>) -> rusqlite::Result<SearchableDocFields> {
    Ok(SearchableDocFields {
        file_name: row.get(0)?,
        title: row.get(1)?,
        summary: row.get(2)?,
        keywords: parse_json_vec(row.get(3)?),
    })
}

fn fetch_searchable_fields(conn: &Connection, id: i64) -> Option<SearchableDocFields> {
    let mut stmt = conn
        .prepare("SELECT file_name, title, summary, keywords FROM documents WHERE id = ?1")
        .ok()?;
    stmt.query_row(rusqlite::params![id], row_to_searchable).ok()
}

/// Fetch searchable text fields and doc_type for many documents in one query.
pub fn fetch_doc_fields_batch(conn: &Connection, ids: &[i64]) -> HashMap<i64, DocFields> {
    if ids.is_empty() {
        return HashMap::new();
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, file_name, title, summary, keywords, doc_type
         FROM documents
         WHERE id IN ({placeholders})"
    );

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };

    let params: Vec<Box<dyn rusqlite::ToSql>> = ids
        .iter()
        .map(|&id| Box::new(id) as Box<dyn rusqlite::ToSql>)
        .collect();
    let p_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|v| v.as_ref()).collect();

    let rows = match stmt.query_map(p_ref.as_slice(), |row| {
        let id: i64 = row.get(0)?;
        Ok((
            id,
            DocFields {
                searchable: SearchableDocFields {
                    file_name: row.get(1)?,
                    title: row.get(2)?,
                    summary: row.get(3)?,
                    keywords: parse_json_vec(row.get(4)?),
                },
                doc_type: row.get(5)?,
            },
        ))
    }) {
        Ok(r) => r,
        Err(_) => return HashMap::new(),
    };

    rows.filter_map(|r| r.ok()).collect()
}

/// Jaro-Winkler score (0–100) averaged across keywords against document text.
pub fn score_keywords(keywords: &[String], doc: &SearchableDocFields) -> f32 {
    if keywords.is_empty() {
        return 0.0;
    }

    let haystack = doc.searchable_text().to_lowercase();
    let words: Vec<&str> = haystack.split_whitespace().collect();

    let mut total = 0.0f32;
    for kw in keywords {
        let kw_lower = kw.to_lowercase();
        let mut best = jaro_winkler(&kw_lower, &haystack) as f32;
        for word in &words {
            best = best.max(jaro_winkler(&kw_lower, word) as f32);
        }
        total += best;
    }

    (total / keywords.len() as f32) * 100.0
}

pub fn score_document(conn: &Connection, doc_id: i64, keywords: &[String]) -> f32 {
    fetch_searchable_fields(conn, doc_id)
        .map(|fields| score_keywords(keywords, &fields))
        .unwrap_or(0.0)
}

pub const RELEVANCE_THRESHOLD: f32 = 70.0;

pub fn is_relevant(score: f32) -> bool {
    score >= RELEVANCE_THRESHOLD
}
