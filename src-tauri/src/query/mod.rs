use std::collections::{HashMap, HashSet};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::{llm, store};

// ── Prompts ───────────────────────────────────────────────────────────────────

const QUERY_ANALYSIS_PROMPT: &str = r#"You are a document search expert. Analyze the following query and extract search parameters for a full-text document index.

Return a JSON object with:
{
  "intent": "what the user is looking for",
  "keywords": ["content terms that would literally appear inside the documents — always include the subject nouns; EXCLUDE only pure query-intent verbs such as מצא, חפש, הצג, find, search, show, list"],
  "entities": ["specific company names, people names, or places explicitly mentioned"],
  "doc_types": ["document type ONLY when explicitly stated: contract, report, invoice, memo, specification, presentation, spreadsheet, letter, policy, manual, other"],
  "language": "ISO 639-1 code if specified, else null",
  "date_range": {"from": "YYYY-MM-DD or null", "to": "YYYY-MM-DD or null"},
  "summary_importance": true or false
}

Rules:
- Always extract content nouns as keywords (e.g. "חוזה שכירות" → keywords: ["חוזה", "שכירות"])
- Strip only the verb wrapper (מצא/find/חפש) — keep everything else as keywords
- doc_types is supplemental metadata, not a replacement for keywords
- keep keywords to the 1-3 most distinctive terms

Respond ONLY with valid JSON. No markdown or explanation.

Query: {query}"#;

const RERANK_PROMPT: &str = r#"You are a legal document search reranker.
Analyze the user query and the list of candidate documents below.
Identify which candidates are actually relevant to the user query.
Sort them by relevance (most relevant first).
Exclude any candidates that do not match the specific intent (e.g. if query is for rental "שכירות", exclude sale "מכר", loan "הלוואה", or employment "העסקה").

Return ONLY a JSON array of integers representing the relevant document IDs. No markdown, no code blocks, no explanation.

User Query: "{query}"

Candidates:
{candidates_json}"#;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug, Default)]
struct DateRange {
    from: Option<String>,
    to: Option<String>,
}

#[derive(Deserialize, Debug, Default)]
struct QueryAnalysis {
    keywords: Option<Vec<String>>,
    entities: Option<Vec<String>>,
    doc_types: Option<Vec<String>>,
    date_range: Option<DateRange>,
    #[allow(dead_code)]
    summary_importance: Option<bool>,
}

#[derive(Serialize, Clone, Debug)]
pub struct DocumentRow {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub doc_type: Option<String>,
    pub doc_date: Option<String>,
    pub language: Option<String>,
    pub keywords: Vec<String>,
    pub topics: Vec<String>,
    pub entities: Vec<String>,
    pub authors: Vec<String>,
    pub page_count: Option<i32>,
    pub confidence: Option<f64>,
}

#[derive(Serialize)]
struct RerankCandidate {
    id: i64,
    file_name: String,
    title: Option<String>,
    summary: Option<String>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn parse_json_vec(s: Option<String>) -> Vec<String> {
    s.and_then(|v| serde_json::from_str::<Vec<String>>(&v).ok())
        .unwrap_or_default()
}

fn clean_json(raw: &str) -> String {
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

fn fts_term(kw: &str) -> String {
    format!("\"{}\"", kw.replace('"', "\"\""))
}

fn row_to_doc(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentRow> {
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
fn has_embeddings(conn: &Connection) -> bool {
    let count: i64 = conn
        .query_row("SELECT COUNT(1) FROM document_chunks", [], |row| row.get(0))
        .unwrap_or(0);
    count > 0
}

// ── Filtering & Querying ──────────────────────────────────────────────────────

/// Formulate and run a dynamic SQL query to get document IDs passing hard filters
fn get_filtered_document_ids(
    conn: &Connection,
    doc_types: Option<&Vec<String>>,
    date_from: Option<&str>,
    date_to: Option<&str>,
    entities: Option<&Vec<String>>,
) -> Option<HashSet<i64>> {
    let mut clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

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
fn execute_smart_query(
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

// ── LLM query analysis ────────────────────────────────────────────────────────

async fn analyze_query(query: &str, api_key: &str, model: &str) -> Result<QueryAnalysis, String> {
    let prompt = QUERY_ANALYSIS_PROMPT.replace("{query}", query);
    let raw = llm::call_claude_simple(&prompt, api_key, model).await?;
    let json_str = clean_json(&raw);
    serde_json::from_str::<QueryAnalysis>(&json_str)
        .map_err(|e| format!("Failed to parse query analysis: {e}. Raw: {}", &json_str[..json_str.len().min(300)]))
}

// Rerank candidates using Claude
async fn rerank_candidates(
    query: &str,
    candidates: Vec<DocumentRow>,
    api_key: &str,
    model: &str,
) -> Result<Vec<DocumentRow>, String> {
    if candidates.is_empty() {
        return Ok(vec![]);
    }
    
    // If only one candidate was returned by local search, no need to call the API to rerank
    if candidates.len() == 1 {
        return Ok(candidates);
    }

    let rerank_items: Vec<RerankCandidate> = candidates
        .iter()
        .map(|c| RerankCandidate {
            id: c.id,
            file_name: c.file_name.clone(),
            title: c.title.clone(),
            summary: c.summary.clone(),
        })
        .collect();

    let candidates_json = serde_json::to_string(&rerank_items).unwrap_or_default();
    let prompt = RERANK_PROMPT
        .replace("{query}", query)
        .replace("{candidates_json}", &candidates_json);

    let response_raw = llm::call_claude_simple(&prompt, api_key, model).await?;
    let cleaned = clean_json(&response_raw);

    let matched_ids: Vec<i64> = serde_json::from_str(&cleaned)
        .map_err(|e| format!("Failed to parse rerank list: {e}. Raw: {cleaned}"))?;

    let mut candidates_map: HashMap<i64, DocumentRow> = candidates
        .into_iter()
        .map(|c| (c.id, c))
        .collect();

    let sorted: Vec<DocumentRow> = matched_ids
        .into_iter()
        .filter_map(|id| candidates_map.remove(&id))
        .collect();

    Ok(sorted)
}

// ── Tauri command ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn search_documents(
    app: AppHandle,
    query: String,
    api_key: String,
    limit: Option<usize>,
    model: Option<String>,
) -> Result<Vec<DocumentRow>, String> {
    let model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());
    let limit = limit.unwrap_or(10);

    let analysis = analyze_query(&query, &api_key, &model).await?;

    let conn = store::open_db(&app)?;
    let local_results = execute_smart_query(&conn, &analysis, &query, limit * 2);

    // Rerank candidates using Claude to discard generic boilerplate matches
    rerank_candidates(&query, local_results, &api_key, &model).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_similarity_run() {
        let conn = Connection::open("/home/tsemach/.local/share/com.tsemach.doron-desktop/documents.db").unwrap();
        let query_text = "מצא חוזה שכירות מ-2024";
        let query_vec = crate::embeddings::get_query_embedding(query_text).unwrap();

        let mut stmt = conn.prepare("SELECT d.id, d.file_name, c.chunk_index, c.embedding FROM documents d JOIN document_chunks c ON d.id = c.document_id").unwrap();
        let rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let file_name: String = row.get(1)?;
            let chunk_idx: i32 = row.get(2)?;
            let bytes: Vec<u8> = row.get(3)?;
            Ok((id, file_name, chunk_idx, bytes))
        }).unwrap();

        println!("\nSIMILARITY SCORES FOR QUERY: {}", query_text);
        for row in rows.flatten() {
            let (id, file_name, chunk_idx, bytes) = row;
            let chunk_vec = crate::embeddings::bytes_to_vec(&bytes);
            let similarity = crate::embeddings::cosine_similarity(&query_vec, &chunk_vec);
            println!("Doc ID {} ({}) - Chunk {}: similarity = {}", id, file_name, chunk_idx, similarity);
        }
    }
}
