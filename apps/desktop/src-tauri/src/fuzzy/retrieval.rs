use std::collections::{HashMap, HashSet};

use rusqlite::Connection;

use super::tokens::{exact_term, prefix_term};

const LIKE_POOL_CAP: usize = 200;
const LIKE_BASE_SCORE: f32 = 25.0;

fn query_fts_with_filter(
    conn: &Connection,
    match_expr: &str,
    filter_ids: Option<&HashSet<i64>>,
    limit: usize,
) -> Vec<(i64, f32)> {
    let sql = "
        SELECT d.id, fts.rank
        FROM documents d
        JOIN documents_fts fts ON d.id = fts.rowid
        WHERE documents_fts MATCH ?1
        ORDER BY rank
    ";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let rows = match stmt.query_map(rusqlite::params![match_expr], |row| {
        let id: i64 = row.get(0)?;
        let rank: f64 = row.get(1)?;
        Ok((id, rank))
    }) {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    let mut results = Vec::new();
    for row in rows.flatten() {
        let (id, rank) = row;
        if let Some(set) = filter_ids {
            if !set.contains(&id) {
                continue;
            }
        }
        let score = (100.0 - rank) as f32;
        results.push((id, score));
    }
    results.truncate(limit);
    results
}

/// Broad substring match using the first few characters of each keyword.
/// Catches typos that FTS misses (e.g. "contrct" → LIKE '%con%' → "contract").
fn query_like_pool(
    conn: &Connection,
    keywords: &[String],
    filter_ids: Option<&HashSet<i64>>,
    limit: usize,
) -> Vec<(i64, f32)> {
    if keywords.is_empty() {
        return vec![];
    }

    let mut clauses = Vec::new();
    let mut params: Vec<String> = Vec::new();

    for kw in keywords {
        let prefix: String = kw.chars().take(3).collect();
        if prefix.len() < 2 {
            continue;
        }
        let pattern = format!("%{}%", prefix.to_lowercase());
        let idx = params.len() + 1;
        clauses.push(format!(
            "(LOWER(COALESCE(title, '')) LIKE ?{idx} OR LOWER(file_name) LIKE ?{idx} OR LOWER(COALESCE(keywords, '')) LIKE ?{idx})"
        ));
        params.push(pattern);
    }

    if clauses.is_empty() {
        return vec![];
    }

    let sql = format!(
        "SELECT id FROM documents WHERE {} LIMIT {}",
        clauses.join(" OR "),
        LIKE_POOL_CAP
    );

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let p_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
    let rows = match stmt.query_map(p_ref.as_slice(), |row| row.get::<_, i64>(0)) {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    let mut results = Vec::new();
    for row in rows.flatten() {
        let id = row;
        if let Some(set) = filter_ids {
            if !set.contains(&id) {
                continue;
            }
        }
        results.push((id, LIKE_BASE_SCORE));
        if results.len() >= limit {
            break;
        }
    }
    results
}

/// Tiered candidate retrieval: exact AND → exact OR → prefix OR → LIKE pool.
pub fn search(
    conn: &Connection,
    keywords: Option<&[String]>,
    filter_ids: Option<&HashSet<i64>>,
    limit: usize,
) -> HashMap<i64, f32> {
    let mut scores = HashMap::new();
    let Some(keywords) = keywords else {
        return scores;
    };
    if keywords.is_empty() {
        return scores;
    }

    let and_expr = keywords.iter().map(|k| exact_term(k)).collect::<Vec<_>>().join(" ");
    let mut matches = query_fts_with_filter(conn, &and_expr, filter_ids, limit * 2);

    if matches.is_empty() {
        let or_expr = keywords
            .iter()
            .map(|k| exact_term(k))
            .collect::<Vec<_>>()
            .join(" OR ");
        matches = query_fts_with_filter(conn, &or_expr, filter_ids, limit * 2);
    }

    if matches.is_empty() {
        let prefix_expr = keywords
            .iter()
            .map(|k| prefix_term(k))
            .collect::<Vec<_>>()
            .join(" OR ");
        matches = query_fts_with_filter(conn, &prefix_expr, filter_ids, limit * 2);
    }

    if matches.is_empty() {
        matches = query_like_pool(conn, keywords, filter_ids, limit * 2);
    }

    for (id, score) in matches {
        scores.insert(id, score);
    }
    scores
}
