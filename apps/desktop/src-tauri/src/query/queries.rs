use std::collections::{HashMap, HashSet};

use rusqlite::Connection;

use super::filters::filtered_document_ids;
use super::helpers::{has_embeddings, row_to_doc};
use super::types::{DocumentRow, QueryAnalysis, TagFilter};

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

/// Back-compat alias for eval tests and external callers.
pub fn query_by_fts(
    conn: &Connection,
    keywords: Option<&Vec<String>>,
    filter_ids: Option<&HashSet<i64>>,
    limit: usize,
) -> HashMap<i64, f32> {
    crate::fuzzy::search(
        conn,
        keywords.map(|k| k.as_slice()),
        filter_ids,
        limit,
    )
}

/// Generate query embedding and calculate cosine similarity over all stored chunks.
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

/// Orchestrates structured filters, fuzzy retrieval, vector search, and ranking.
pub fn query_smart_execute(
    conn: &Connection,
    analysis: &QueryAnalysis,
    query_text: &str,
    tags: Option<&[TagFilter]>,
    notes_contains: Option<&str>,
    limit: usize,
) -> Vec<DocumentRow> {
    let date_range_from = analysis.date_range.as_ref().and_then(|r| r.from.as_deref());
    let date_range_to = analysis.date_range.as_ref().and_then(|r| r.to.as_deref());
    let has_explicit_filter = tags.is_some_and(|t| !t.is_empty())
        || notes_contains.is_some_and(|s| !s.trim().is_empty());
    let mut filter_ids = filtered_document_ids(
        conn,
        date_range_from,
        date_range_to,
        tags,
        notes_contains,
    );

    if let Some(ref set) = filter_ids {
        if set.is_empty() && !has_explicit_filter {
            filter_ids = None;
        }
    }

    let keywords = analysis.keywords.as_deref();
    let retrieval_scores = crate::fuzzy::search(conn, keywords, filter_ids.as_ref(), limit);

    let mut vec_scores = HashMap::new();
    if !super::USE_FTS_ONLY {
        let vec_matches = query_by_vector(conn, query_text, filter_ids.as_ref(), limit * 3);
        for (id, score) in vec_matches {
            vec_scores.insert(id, score);
        }
    }

    let all_ids: HashSet<i64> = retrieval_scores
        .keys()
        .copied()
        .chain(vec_scores.keys().copied())
        .collect();
    let has_embs = has_embeddings(conn);

    let final_ids = if all_ids.is_empty() {
        if let Some(ref set) = filter_ids {
            set.iter().copied().collect::<Vec<_>>()
        } else {
            vec![]
        }
    } else {
        let candidate_ids: Vec<i64> = all_ids.iter().copied().collect();
        let doc_fields = crate::fuzzy::fetch_doc_fields_batch(conn, &candidate_ids);
        let mut combined_scores = HashMap::new();
        let query_type_dist = parse_query_distribution(&analysis.doc_types);

        for id in all_ids {
            let vec_score = vec_scores.get(&id).copied().unwrap_or(0.0);
            let retrieval_score = retrieval_scores.get(&id).copied().unwrap_or(0.0);

            let doc_type_dist = doc_fields
                .get(&id)
                .map(|fields| parse_distribution(&fields.doc_type))
                .unwrap_or_default();
            let type_score = compute_type_overlap(&query_type_dist, &doc_type_dist);

            let fuzzy_score = keywords
                .filter(|k| !k.is_empty())
                .and_then(|k| {
                    doc_fields
                        .get(&id)
                        .map(|fields| crate::fuzzy::score_keywords(k, &fields.searchable))
                })
                .unwrap_or(0.0);

            let is_relevant = if has_embs && !super::USE_FTS_ONLY {
                vec_score >= 0.75 || (retrieval_score > 0.0 && vec_score >= 0.68)
            } else {
                retrieval_score > 0.0 || crate::fuzzy::is_relevant(fuzzy_score)
            };

            if is_relevant {
                let combined = if super::USE_FTS_ONLY {
                    retrieval_score + (fuzzy_score * 0.35) + (type_score as f32 * 0.20)
                } else {
                    vec_score + (retrieval_score / 200.0) + (fuzzy_score * 0.15) + (type_score as f32 * 0.20)
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

        if !ids.is_empty() {
            let top_score = combined_scores.get(&ids[0]).copied().unwrap_or(0.0);
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

    let params: Vec<Box<dyn rusqlite::ToSql>> = final_ids
        .iter()
        .map(|&id| Box::new(id) as Box<dyn rusqlite::ToSql>)
        .collect();
    let p_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|v| v.as_ref()).collect();

    let mut docs_map = match stmt.query_map(p_ref.as_slice(), row_to_doc) {
        Ok(rows) => rows
            .filter_map(|r| r.ok())
            .map(|d| (d.id, d))
            .collect::<HashMap<_, _>>(),
        Err(_) => return vec![],
    };

    final_ids
        .into_iter()
        .filter_map(|id| docs_map.remove(&id))
        .take(limit)
        .collect()
}
