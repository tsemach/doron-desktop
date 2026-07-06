use std::collections::{HashMap, HashSet};
use rusqlite::Connection;
use super::types::{QueryAnalysis, DocumentRow};
use super::helpers::{fts_term, row_to_doc, has_embeddings};

/// Formulate and run a dynamic SQL query to get document IDs passing hard filters
fn get_filtered_document_ids(
    conn: &Connection,
    doc_types: Option<&Vec<String>>,
    date_from: Option<&str>,
    date_to: Option<&str>,
    entities: Option<&Vec<String>>,
) -> Option<HashSet<i64>> {
    let has_metadata: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM documents WHERE doc_type IS NOT NULL AND doc_type != 'other')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    let mut clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if has_metadata {
        if let Some(types) = doc_types {
            if !types.is_empty() {
                let placeholders = types
                    .iter()
                    .enumerate()
                    .map(|(i, _)| format!("?{}", params.len() + i + 1))
                    .collect::<Vec<_>>()
                    .join(",");
                clauses.push(format!("doc_type IN ({placeholders})"));
                for t in types {
                    params.push(Box::new(t.clone()));
                }
            }
        }
    }

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

    if has_metadata {
        if let Some(ents) = entities {
            if !ents.is_empty() {
                let or_clauses: Vec<String> = ents
                    .iter()
                    .enumerate()
                    .map(|(i, _)| {
                        format!(
                            "(entities LIKE ?{} OR authors LIKE ?{})",
                            params.len() + i * 2 + 1,
                            params.len() + i * 2 + 2
                        )
                    })
                    .collect();
                clauses.push(format!("({})", or_clauses.join(" OR ")));
                for ent in ents {
                    let pattern = format!("%{ent}%");
                    params.push(Box::new(pattern.clone()));
                    params.push(Box::new(pattern));
                }
            }
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

/// Generate query embedding and calculate cosine similarity over all stored chunks
fn query_by_vector(
    conn: &Connection,
    query_text: &str,
    filter_ids: Option<&HashSet<i64>>,
    limit: usize,
) -> Vec<(i64, f32)> {
    let query_vec = match crate::embeddings::get_query_embedding(query_text) {
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
pub(crate) fn execute_smart_query(
    conn: &Connection,
    analysis: &QueryAnalysis,
    query_text: &str,
    limit: usize,
) -> Vec<DocumentRow> {
    // 1. Resolve structured filters
    let date_range_from = analysis.date_range.as_ref().and_then(|r| r.from.as_deref());
    let date_range_to = analysis.date_range.as_ref().and_then(|r| r.to.as_deref());
    let filter_ids = get_filtered_document_ids(
        conn,
        analysis.doc_types.as_ref(),
        date_range_from,
        date_range_to,
        analysis.entities.as_ref(),
    );

    // If hard filters are specified but found nothing, return empty immediately.
    if let Some(ref set) = filter_ids {
        if set.is_empty() {
            return vec![];
        }
    }

    // 2. Fetch FTS matches
    let mut fts_scores = HashMap::new();
    if let Some(keywords) = &analysis.keywords {
        if !keywords.is_empty() {
            let and_expr = keywords.iter().map(|k| fts_term(k)).collect::<Vec<_>>().join(" ");
            let matches = query_by_fts_with_filter(conn, &and_expr, filter_ids.as_ref(), limit * 2);

            let matches = if matches.is_empty() {
                let or_expr = keywords.iter().map(|k| fts_term(k)).collect::<Vec<_>>().join(" OR ");
                query_by_fts_with_filter(conn, &or_expr, filter_ids.as_ref(), limit * 2)
            } else {
                matches
            };

            for (id, score) in matches {
                fts_scores.insert(id, score);
            }
        }
    }

    // 3. Fetch Vector Similarity matches
    let mut vec_scores = HashMap::new();
    let vec_matches = query_by_vector(conn, query_text, filter_ids.as_ref(), limit * 3);
    for (id, score) in vec_matches {
        vec_scores.insert(id, score);
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
        for id in all_ids {
            let vec_score = vec_scores.get(&id).copied().unwrap_or(0.0);
            let fts_score = fts_scores.get(&id).copied().unwrap_or(0.0);

            // Stricter Relevance Verification:
            let is_relevant = if has_embs {
                vec_score >= 0.75 || (fts_score > 0.0 && vec_score >= 0.68)
            } else {
                fts_score > 0.0
            };

            if is_relevant {
                // Combine: vector similarity + normalized FTS score (fts_score / 200.0)
                let combined = vec_score + (fts_score / 200.0);
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
