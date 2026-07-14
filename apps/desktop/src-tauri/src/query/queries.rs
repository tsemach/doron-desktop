use std::collections::{HashMap, HashSet};
use rusqlite::Connection;
use super::types::{QueryAnalysis, DocumentRow};
use super::helpers::{fts_term, row_to_doc, has_embeddings};

/// Formulate and run a dynamic SQL query to get document IDs passing hard filters
fn get_filtered_document_ids(
    conn: &Connection,
    date_from: Option<&str>,
    date_to: Option<&str>,
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

fn parse_distribution(val_opt: &Option<String>) -> HashMap<String, f64> {
    let mut dist = HashMap::new();
    if let Some(s) = val_opt {
        let trimmed = s.trim();
        if trimmed.starts_with('{') {
            if let Ok(map) = serde_json::from_str::<HashMap<String, f64>>(trimmed) {
                return map;
            }
        }
        if !trimmed.is_empty() {
            dist.insert(trimmed.to_string(), 1.0);
        }
    }
    dist
}

fn parse_query_distribution(val_opt: &Option<serde_json::Value>) -> HashMap<String, f64> {
    let mut dist = HashMap::new();
    if let Some(val) = val_opt {
        match val {
            serde_json::Value::Object(map) => {
                for (k, v) in map {
                    if let Some(prob) = v.as_f64() {
                        dist.insert(k.clone(), prob);
                    }
                }
            }
            serde_json::Value::Array(arr) => {
                let count = arr.len() as f64;
                if count > 0.0 {
                    for item in arr {
                        if let Some(s) = item.as_str() {
                            dist.insert(s.to_string(), 1.0 / count);
                        }
                    }
                }
            }
            serde_json::Value::String(s) => {
                dist.insert(s.clone(), 1.0);
            }
            _ => {}
        }
    }
    dist
}

fn compute_type_overlap(query_dist: &HashMap<String, f64>, doc_dist: &HashMap<String, f64>) -> f64 {
    let mut score = 0.0;
    for (k, q_p) in query_dist {
        if let Some(d_p) = doc_dist.get(k) {
            score += q_p * d_p;
        }
    }
    score
}

/// Retrieve documents matching the FTS query and filter them by ID set
fn query_by_fts_with_filter(
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
        // sqlite fts rank lower is better (0.0 is perfect match). Convert to positive score.
        let score = (100.0 - rank) as f32;
        results.push((id, score));
    }
    results.truncate(limit);
    results
}

/// Query the FTS database and collect scores into a HashMap
pub fn query_by_fts(
    conn: &Connection,
    keywords: Option<&Vec<String>>,
    filter_ids: Option<&HashSet<i64>>,
    limit: usize,
) -> HashMap<i64, f32> {
    let mut fts_scores = HashMap::new();
    if let Some(keywords) = keywords {
        if !keywords.is_empty() {
            let and_expr = keywords.iter().map(|k| fts_term(k)).collect::<Vec<_>>().join(" ");
            let matches = query_by_fts_with_filter(conn, &and_expr, filter_ids, limit * 2);

            let matches = if matches.is_empty() {
                let or_expr = keywords.iter().map(|k| fts_term(k)).collect::<Vec<_>>().join(" OR ");
                query_by_fts_with_filter(conn, &or_expr, filter_ids, limit * 2)
            } else {
                matches
            };

            for (id, score) in matches {
                fts_scores.insert(id, score);
            }
        }
    }
    fts_scores
}

/// Generate query embedding and calculate cosine similarity over all stored chunks
pub fn query_by_vector(
    conn: &Connection,
    query_text: &str,
    filter_ids: Option<&HashSet<i64>>,
    limit: usize,
) -> Vec<(i64, f32)> {
    let query_vec = match crate::embeddings::embedding_by_query(query_text) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let sql = "SELECT document_id, embedding FROM document_chunks";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let rows = match stmt.query_map([], |row| {
        let doc_id: i64 = row.get(0)?;
        let bytes: Vec<u8> = row.get(1)?;
        Ok((doc_id, bytes))
    }) {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    let mut doc_scores = HashMap::new();

    for row in rows.flatten() {
        let (doc_id, bytes) = row;
        if let Some(set) = filter_ids {
            if !set.contains(&doc_id) {
                continue;
            }
        }

        let chunk_vec = crate::embeddings::bytes_to_vec(&bytes);
        let similarity = crate::embeddings::cosine_similarity(&query_vec, &chunk_vec);

        let entry = doc_scores.entry(doc_id).or_insert(-1.0f32);
        if similarity > *entry {
            *entry = similarity;
        }
    }

    let mut results: Vec<(i64, f32)> = doc_scores.into_iter().collect();
    results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);
    results
}

/// Core smart query dispatcher executing both text/FTS search and vector search
pub fn query_smart_execute(
    conn: &Connection,
    analysis: &QueryAnalysis,
    query_text: &str,
    limit: usize,
) -> Vec<DocumentRow> {
    // 1. Resolve structured filters (dates only)
    let date_range_from = analysis.date_range.as_ref().and_then(|r| r.from.as_deref());
    let date_range_to = analysis.date_range.as_ref().and_then(|r| r.to.as_deref());
    let mut filter_ids = get_filtered_document_ids(
        conn,
        date_range_from,
        date_range_to,
    );

    // Resilient Fallback: If hard filters (dates only) matched 0 documents,
    // fallback to searching everything instead of returning empty results immediately.
    if let Some(ref set) = filter_ids {
        if set.is_empty() {
            filter_ids = None;
        }
    }

    // 2. Fetch FTS matches
    let fts_scores = query_by_fts(conn, analysis.keywords.as_ref(), filter_ids.as_ref(), limit);

    // 3. Fetch Vector Similarity matches (bypassed if FTS-only is active)
    let mut vec_scores = HashMap::new();
    if !super::USE_FTS_ONLY {
        let vec_matches = query_by_vector(conn, query_text, filter_ids.as_ref(), limit * 3);
        for (id, score) in vec_matches {
            vec_scores.insert(id, score);
        }
    }

    // 4. Merge results using a strict semantic relevance check
    let all_ids: HashSet<i64> = fts_scores.keys().copied().chain(vec_scores.keys().copied()).collect();
    let has_embs = has_embeddings(conn);

    let final_ids = if all_ids.is_empty() {
        if let Some(ref set) = filter_ids {
            set.iter().copied().collect::<Vec<_>>()
        } else {
            vec![]
        }
    } else {
        let mut combined_scores = HashMap::new();
        let query_type_dist = parse_query_distribution(&analysis.doc_types);

        for id in all_ids {
            let vec_score = vec_scores.get(&id).copied().unwrap_or(0.0);
            let fts_score = fts_scores.get(&id).copied().unwrap_or(0.0);

            // Fetch document metadata to extract its doc_type distribution
            let doc_type_val = {
                let stmt = conn.prepare("SELECT doc_type FROM documents WHERE id = ?1").ok();
                stmt.and_then(|mut s| s.query_row(rusqlite::params![id], |r| r.get::<_, Option<String>>(0)).ok()).flatten()
            };
            let doc_type_dist = parse_distribution(&doc_type_val);
            let type_score = compute_type_overlap(&query_type_dist, &doc_type_dist);

            // Stricter Relevance Verification:
            let is_relevant = if has_embs && !super::USE_FTS_ONLY {
                vec_score >= 0.75 || (fts_score > 0.0 && vec_score >= 0.68)
            } else {
                fts_score > 0.0
            };

            if is_relevant {
                // Combine scores:
                let combined = if super::USE_FTS_ONLY {
                    fts_score + (type_score as f32 * 0.20)
                } else {
                    vec_score + (fts_score / 200.0) + (type_score as f32 * 0.20)
                };
                combined_scores.insert(id, combined);
            }
        }

        let mut ids: Vec<i64> = combined_scores.keys().copied().collect();
        ids.sort_by(|a, b| {
            let sa = combined_scores.get(a).unwrap_or(&0.0);
            let sb = combined_scores.get(b).unwrap_or(&0.0);
            sb.partial_cmp(sa).unwrap_or(std::cmp::Ordering::Equal)
        });

        // Relative Score Thresholding:
        if !ids.is_empty() {
            let top_score = combined_scores.get(&ids[0]).copied().unwrap_or(0.0);
            // Retain documents scoring within 0.15 of the best match
            ids.retain(|id| {
                let score = combined_scores.get(id).copied().unwrap_or(0.0);
                score >= top_score - 0.15
            });
        }

        ids
    };

    if final_ids.is_empty() {
        return vec![];
    }

    // 5. Fetch full document details preserving order
    let placeholders = final_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, file_path, file_name, title, summary, doc_type,
                doc_date, language, keywords, topics, entities,
                authors, page_count, confidence
         FROM documents
         WHERE id IN ({placeholders})"
    );

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let params: Vec<Box<dyn rusqlite::ToSql>> = final_ids.iter().map(|&id| Box::new(id) as Box<dyn rusqlite::ToSql>).collect();
    let p_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|v| v.as_ref()).collect();

    let mut docs_map = match stmt.query_map(p_ref.as_slice(), row_to_doc) {
        Ok(rows) => rows.filter_map(|r| r.ok()).map(|d| (d.id, d)).collect::<HashMap<_, _>>(),
        Err(_) => return vec![],
    };

    final_ids.into_iter()
        .filter_map(|id| docs_map.remove(&id))
        .take(limit)
        .collect()
}
