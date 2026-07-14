use tauri::AppHandle;
use std::collections::HashMap;
use crate::store;
use crate::embeddings;
use crate::llm::llm_provider::{get_active_provider, ProviderConfig};

use super::types::{EmailConfig, MatchResult};
use super::emails_ops::is_transactional_or_spam;

struct CaseCandidate {
    id: i64,
    name: String,
    subject: String,
    folder: String,
}

fn fetch_active_cases(app: &AppHandle) -> Result<Vec<CaseCandidate>, String> {
    let conn = store::open_db(app).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, subject, folder FROM cases WHERE deleted = 0 OR deleted IS NULL")
        .map_err(|e| e.to_string())?;

    let cases_rows = stmt.query_map([], |r| {
        Ok(CaseCandidate {
            id: r.get(0)?,
            name: r.get(1)?,
            subject: r.get(2).unwrap_or_default(),
            folder: r.get(3).unwrap_or_default(),
        })
    });

    let cases: Vec<CaseCandidate> = cases_rows
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(cases)
}

fn check_exact_subject_match(cases: &[CaseCandidate], subject: &str) -> Option<i64> {
    for kase in cases {
        let lower_subject = subject.to_lowercase();
        let lower_name = kase.name.to_lowercase();
        let lower_case_subj = kase.subject.to_lowercase();

        if lower_subject.contains(&lower_name) {
            return Some(kase.id);
        }

        if !lower_case_subj.is_empty() {
            if lower_subject.contains(&lower_case_subj) {
                return Some(kase.id);
            }
            // Check parts split by '-' or ':'
            for part in lower_case_subj.split(|c| c == '-' || c == ':') {
                let trimmed = part.trim();
                if trimmed.len() >= 4 && lower_subject.contains(trimmed) {
                    return Some(kase.id);
                }
            }
        }
    }
    None
}

fn compute_case_similarities(
    app: &AppHandle,
    cases: &[CaseCandidate],
    query_vector: &[f32],
) -> Result<HashMap<i64, f32>, String> {
    let conn = store::open_db(app).map_err(|e| e.to_string())?;
    let mut case_similarities: HashMap<i64, f32> = HashMap::new();

    let mut doc_stmt = conn
        .prepare("SELECT d.id, d.file_path, c.embedding FROM documents d JOIN document_chunks c ON d.id = c.document_id")
        .map_err(|e| e.to_string())?;

    let doc_rows = doc_stmt.query_map([], |r| {
        let doc_id: i64 = r.get(0)?;
        let file_path: String = r.get(1)?;
        let embedding_bytes: Vec<u8> = r.get(2)?;
        Ok((doc_id, file_path, embedding_bytes))
    }).map_err(|e| e.to_string())?;

    for row in doc_rows.flatten() {
        let (_, file_path, bytes) = row;
        let doc_vector = embeddings::bytes_to_vec(&bytes);
        let similarity = embeddings::cosine_similarity(query_vector, &doc_vector);

        let norm_path = file_path.replace('\\', "/");
        for kase in cases {
            let norm_folder = kase.folder.replace('\\', "/");
            if norm_path.starts_with(&norm_folder) {
                let entry = case_similarities.entry(kase.id).or_insert(0.0);
                if similarity > *entry {
                    *entry = similarity;
                }
            }
        }
    }
    Ok(case_similarities)
}

async fn call_llm_classification(
    config: &crate::llm::AiConfig,
    sender: &str,
    subject: &str,
    snippet: &str,
    top_cases: &[&CaseCandidate],
) -> Result<(Option<i64>, f64, String), String> {
    let provider = get_active_provider(ProviderConfig {
        provider_type: if config.ai_mode == "local" { "local".to_string() } else { config.provider.clone() },
        api_key: if config.ai_mode == "local" { "".to_string() } else { config.api_key_enc.clone() },
        model: config.ai_model.clone(),
        base_url: if config.ai_mode == "local" { Some("http://localhost:10086/v1".to_string()) } else { None },
    });

    let mut candidate_list = String::new();
    for kase in top_cases {
        candidate_list.push_str(&format!(
            "- Case ID {}: Name \"{}\", Subject: \"{}\"\n",
            kase.id, kase.name, kase.subject
        ));
    }

    let system_prompt = "You are a legal file sorter. Compare the incoming email details against the top 3 case candidates. Select the correct matching case ID. If none of the candidates are relevant, or the email is spam/unrelated personal mail, return null. Always output valid JSON inside a structure: {\"suggested_case_id\": number_or_null, \"confidence\": float_0_1, \"reason\": \"explanation\"}.";

    let prompt = format!(
        "INCOMING EMAIL:\nFrom: {}\nSubject: {}\nSnippet: {}\n\nTOP CANDIDATES:\n{}\nDetermine the matching Case ID.",
        sender, subject, snippet, candidate_list
    );

    match provider.call_structured(&prompt, Some(system_prompt), None).await {
        Ok(json_res) => {
            let cleaned = json_res.trim();
            let start = cleaned.find('{').unwrap_or(0);
            let end = cleaned.rfind('}').unwrap_or(cleaned.len() - 1);
            let clean_json = &cleaned[start..=end];

            match serde_json::from_str::<MatchResult>(clean_json) {
                Ok(res) => Ok((res.suggested_case_id, res.confidence, res.reason)),
                Err(e) => Err(format!("Failed parsing matching JSON: {e}. Raw: {json_res}")),
            }
        }
        Err(e) => Err(format!("LLM classification API error: {e}")),
    }
}

pub(crate) async fn run_cascade_classification(
    app: &AppHandle,
    _config: &EmailConfig,
    sender: &str,
    subject: &str,
    snippet: &str,
) -> (Option<i64>, f64, String) {
    if is_transactional_or_spam(sender, subject) {
        return (
            None,
            0.0,
            "Transactional or spam email ignored.".to_string(),
        );
    }

    // 1. Fetch active cases from database
    let cases = match fetch_active_cases(app) {
        Ok(c) => c,
        Err(e) => return (None, 0.0, format!("Failed to fetch cases: {}", e)),
    };

    if cases.is_empty() {
        return (None, 0.0, "No active cases found in the system".to_string());
    }

    // 2. Direct exact substring match in the email subject first (high efficiency, 100% accurate)
    if let Some(direct_id) = check_exact_subject_match(&cases, subject) {
        return (
            Some(direct_id),
            1.0,
            "High confidence name match (exact substring in subject).".to_string(),
        );
    }

    // 3. Step 1: Rough pre-filter using local embeddings
    let combined_input = format!(
        "email subject: {}\nemail sender: {}\nemail body: {}",
        subject, sender, snippet
    );
    let query_vector = match embeddings::embedding_by_query(&combined_input) {
        Ok(vec) => vec,
        Err(_) => return (None, 0.0, "Failed to generate query embedding".to_string()),
    };

    let case_similarities = match compute_case_similarities(app, &cases, &query_vector) {
        Ok(sims) => sims,
        Err(e) => return (None, 0.0, format!("Failed to compute case similarities: {}", e)),
    };

    // Identify top candidates from embedding checks
    let mut sorted_candidates: Vec<(&i64, &f32)> = case_similarities.iter().collect();
    sorted_candidates.sort_by(|a, b| b.1.partial_cmp(a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Threshold filtering (spams/newsletters have low cosine similarity compared to case docs)
    let best_local_score = sorted_candidates.first().map(|c| *c.1).unwrap_or(0.0);

    let ai_config = crate::llm::get_ai_settings_internal(app);
    let use_llm = ai_config.as_ref().map(|c| {
        if c.ai_mode == "byom" {
            !c.api_key_enc.is_empty()
        } else {
            !c.ai_mode.is_empty()
        }
    }).unwrap_or(false);

    let required_threshold = if use_llm {
        0.76 // More relaxed threshold when verified by LLM
    } else {
        0.84 // Stricter threshold when relying purely on embeddings without LLM verification (E5 Small baseline)
    };

    if best_local_score < required_threshold {
        return (
            None,
            0.0,
            format!("Rough filtering skipped: similarity index {best_local_score:.2} too low (required {required_threshold:.2}). Unrelated to any case."),
        );
    }

    // Get top 3 cases for LLM verification
    let mut top_cases = Vec::new();
    for (&id, _) in sorted_candidates.iter().take(3) {
        if let Some(kase) = cases.iter().find(|c| c.id == id) {
            top_cases.push(kase);
        }
    }

    // If top_cases is empty, fill with default cases
    if top_cases.is_empty() {
        for kase in cases.iter().take(3) {
            top_cases.push(kase);
        }
    }

    // 4. Step 2: Verification using provider-agnostic LLM
    if !use_llm {
        let best_id = top_cases.first().map(|c| c.id);
        return (
            best_id,
            best_local_score as f64,
            "Embedding-only classification (AI config not configured or active)".to_string(),
        );
    }

    if let Some(ref config) = ai_config {
        match call_llm_classification(config, sender, subject, snippet, &top_cases).await {
            Ok((suggested_id, confidence, reason)) => (suggested_id, confidence, reason),
            Err(e) => (
                top_cases.first().map(|c| c.id),
                0.5,
                format!("{}. Falling back to embedding search.", e),
            )
        }
    } else {
        (
            top_cases.first().map(|c| c.id),
            0.5,
            "Fallback to embedding search (no AI config).".to_string(),
        )
    }
}
