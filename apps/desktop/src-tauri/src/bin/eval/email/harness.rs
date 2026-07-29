//! Builds a real SQLite profile from a generated corpus, headless.
//!
//! Shared by `eval email index` and (from P4) the matcher runner, so both exercise the
//! same code the app runs: `store::open_db_by_path` creates the schema inline, and
//! `indexer::index_file_core` does the indexing — no reimplementation, otherwise the
//! eval would be measuring a parallel universe.

use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

use tauri_app_lib::llm::llm_provider::{LlmProvider, MockProvider};
use tauri_app_lib::{case, indexer, store};

use super::corpus::{CorpusCase, EmailFixture};

pub struct Profile {
    pub conn: Connection,
    pub db_path: PathBuf,
    pub cases: Vec<CorpusCase>,
    pub emails: Vec<EmailFixture>,
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

/// Insert the corpus' cases, pointing `folder` at the corpus directory on disk so the
/// document→case derivation has real paths to resolve.
fn insert_cases(conn: &Connection, root: &Path, cases: &[CorpusCase]) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    for case in cases {
        let folder = root.join(&case.folder);
        conn.execute(
            "INSERT INTO cases (id, subject, status, name, created_at, folder)
             VALUES (?1, ?2, 'open', ?3, ?4, ?5)",
            params![
                case.id,
                case.subject,
                case.name,
                now,
                folder.to_string_lossy().to_string()
            ],
        )
        .map_err(|e| format!("[insert case {}] {e}", case.id))?;

        for field in &case.fields {
            conn.execute(
                "INSERT OR REPLACE INTO case_fields (case_id, field_name, field_value)
                 VALUES (?1, ?2, ?3)",
                params![case.id, field.name, field.value],
            )
            .map_err(|e| format!("[insert field for case {}] {e}", case.id))?;
        }
    }
    Ok(())
}

/// Index every corpus document through the real indexer.
async fn index_documents(db_path: &Path, root: &Path, cases: &[CorpusCase]) -> Result<usize, String> {
    // Mock provider: metadata comes from heuristics, so indexing is deterministic and
    // makes no network calls.
    let provider = LlmProvider::Mock(MockProvider {});
    // Heuristic metadata, no embeddings: deterministic and offline.
    let options = indexer::IndexOptions {
        run_llm_metadata: false,
        run_vector_embeddings: false,
    };

    let mut indexed = 0;
    for case in cases {
        for rel in &case.documents {
            let path = root.join(rel);
            if !path.exists() {
                return Err(format!("corpus document missing: {}", path.display()));
            }
            indexer::index_file_core(db_path, &provider, &path, &options, true)
                .await
                .map_err(|e| format!("[index {}] {e}", path.display()))?;
            indexed += 1;
        }
    }
    Ok(indexed)
}


/// Seed `case_emails` with the parents of thread replies.
///
/// A thread fixture models "a reply arrives to a message that was already confirmed to a
/// case", so the parent must exist as a linked email. Without this, Tier A's thread
/// signal has nothing to resolve against and every thread fixture silently fails for a
/// harness reason rather than a matcher one.
fn seed_thread_parents(
    conn: &Connection,
    emails: &[EmailFixture],
) -> Result<usize, String> {
    let referenced: std::collections::HashSet<String> = emails
        .iter()
        .flat_map(|e| e.in_reply_to.iter().cloned().chain(e.references.iter().cloned()))
        .collect();
    if referenced.is_empty() {
        return Ok(0);
    }

    let mut seeded = 0;
    for parent in emails.iter().filter(|e| referenced.contains(&e.message_id)) {
        let Some(case_id) = parent.expected.case_id else {
            continue;
        };
        conn.execute(
            "INSERT OR IGNORE INTO case_emails
                (case_id, message_id, sender, recipient, subject, body_text, direction, received_at)
             VALUES (?1, ?2, ?3, '', ?4, ?5, 'incoming', ?6)",
            params![
                case_id,
                parent.message_id,
                parent.sender,
                parent.subject,
                parent.body_text,
                parent.received_at
            ],
        )
        .map_err(|e| format!("[seed thread parent {}] {e}", parent.id))?;
        seeded += 1;
    }
    Ok(seeded)
}

pub struct BuildOptions {
    /// Delete any existing scratch database first.
    pub fresh: bool,
}

impl Default for BuildOptions {
    fn default() -> Self {
        Self { fresh: true }
    }
}

/// Build a complete profile: cases, documents, and all derived matcher indexes.
pub async fn build_profile(
    corpus_dir: &str,
    options: BuildOptions,
) -> Result<(Profile, usize), String> {
    let root = PathBuf::from(corpus_dir);
    let cases: Vec<CorpusCase> = read_json(&root.join("cases.json"))?;
    let emails: Vec<EmailFixture> = read_json(&root.join("email_matching_dataset.json"))?;

    let db_path = root.join("email_eval_index.db");
    if options.fresh && db_path.exists() {
        std::fs::remove_file(&db_path)
            .map_err(|e| format!("Failed to remove {}: {e}", db_path.display()))?;
    }

    // Schema is created inline by open_db_by_path — no separate migration step.
    let conn = store::open_db_by_path(&db_path)?;
    insert_cases(&conn, &root, &cases)?;
    seed_thread_parents(&conn, &emails)?;
    drop(conn);

    let indexed = index_documents(&db_path, &root, &cases).await?;

    let conn = store::open_db_by_path(&db_path)?;
    case::matcher_backfill::run_backfill(&conn)?;

    Ok((
        Profile {
            conn,
            db_path,
            cases,
            emails,
        },
        indexed,
    ))
}
