use std::path::{Path, PathBuf};
use rusqlite::params;
use tauri::{AppHandle, Manager, Emitter};

use crate::store;
use super::types::{PendingAlert, AttachmentMetadata};
use super::emails_ops::is_transactional_or_spam;
use super::get_email_settings;

/// Recompute the stored suggestion for every pending alert.
///
/// The suggestion is derived data: it is computed once at ingestion and then frozen in the
/// row. That makes it stale the moment anything it depends on changes — the matcher itself,
/// the set of cases, or a case's title. A user who improves the matcher and restarts still
/// sees the old answer, and a suggestion naming a since-deleted case survives forever.
///
/// Only a *better-informed* answer overwrites: if the matcher now finds nothing, the
/// existing suggestion is kept rather than cleared, because `list_pending_email_alerts`
/// treats a null suggestion as spam and deletes the alert outright. Losing a user's queued
/// email to a scoring change would be far worse than showing a stale suggestion.
fn refresh_alert_suggestions(conn: &rusqlite::Connection) -> Result<usize, String> {
    use crate::email::case_matcher::{CaseMatcher, MatcherConfig};
    use crate::email::{
        combined_text, extract_attachment_texts, extract_email_signals, AttachmentLimits,
        CaseMatchPhase, CaseMatchRequest,
    };

    struct Row {
        id: i64,
        message_id: String,
        sender: String,
        subject: String,
        body_text: String,
        attachments_json: String,
        in_reply_to: Option<String>,
        references_ids: Option<String>,
        suggested_case_id: Option<i64>,
    }

    let rows: Vec<Row> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, message_id, sender, subject, COALESCE(body_text, body_snippet, ''),
                        COALESCE(attachments_json, '[]'), in_reply_to, references_ids,
                        suggested_case_id
                 FROM pending_email_alerts",
            )
            .map_err(|e| format!("[refresh alerts] {e}"))?;
        let mapped = stmt
            .query_map([], |r| {
                Ok(Row {
                    id: r.get(0)?,
                    message_id: r.get(1)?,
                    sender: r.get(2)?,
                    subject: r.get(3)?,
                    body_text: r.get(4)?,
                    attachments_json: r.get(5)?,
                    in_reply_to: r.get(6)?,
                    references_ids: r.get(7)?,
                    suggested_case_id: r.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        mapped.flatten().collect()
    };
    if rows.is_empty() {
        return Ok(0);
    }

    let matcher = CaseMatcher::new(MatcherConfig::load(conn));
    let mut updated = 0;

    for row in rows {
        let attachment_text = combined_text(&extract_attachment_texts(
            &row.attachments_json,
            &AttachmentLimits::default(),
        ));
        let body = if attachment_text.is_empty() {
            row.body_text.clone()
        } else {
            format!("{}\n{}", row.body_text, attachment_text)
        };
        let deterministic = extract_email_signals(&row.sender, &row.subject, &body);
        let references: Vec<String> = row
            .references_ids
            .as_deref()
            .and_then(|j| serde_json::from_str(j).ok())
            .unwrap_or_default();

        let request = CaseMatchRequest {
            message_id: row.message_id.clone(),
            sender: row.sender.clone(),
            subject: row.subject.clone(),
            snippet: row.body_text.chars().take(500).collect(),
            body_text: row.body_text.clone(),
            attachment_text,
            in_reply_to: row.in_reply_to.clone(),
            references,
            search_terms: deterministic.to_search_terms(),
            deterministic,
            classification: None,
            phase: CaseMatchPhase::AfterDeterministic,
        };

        let outcome = match matcher.match_email_core(conn, &request) {
            Ok(outcome) => outcome,
            // One unreadable alert must not stop the rest refreshing.
            Err(e) => {
                eprintln!("[refresh alerts] alert {}: {e}", row.id);
                continue;
            }
        };
        let result = outcome.into_case_match_result();
        let Some(case_id) = result.case_id else {
            continue;
        };
        if Some(case_id) == row.suggested_case_id {
            continue;
        }
        conn.execute(
            "UPDATE pending_email_alerts
             SET suggested_case_id = ?1, confidence = ?2, reason = ?3 WHERE id = ?4",
            params![case_id, result.confidence, result.reason, row.id],
        )
        .map_err(|e| format!("[refresh alerts] update {}: {e}", row.id))?;
        updated += 1;
    }
    Ok(updated)
}

#[tauri::command]
pub fn list_pending_email_alerts(app: AppHandle) -> Result<Vec<PendingAlert>, String> {
    println!("[Rust Backend] list_pending_email_alerts called!");
    let conn = store::open_db(&app)?;

    // Clean up existing unrelated/spam pending alerts (suggested_case_id IS NULL or confidence = 0.0)
    let mut cleanup_stmt = conn
        .prepare("SELECT message_id FROM pending_email_alerts WHERE suggested_case_id IS NULL OR confidence = 0.0")
        .map_err(|e| e.to_string())?;

    let message_ids: Vec<String> = cleanup_stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let staging_base = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("email_staging");

    for msg_id in message_ids {
        let folder = staging_base.join(&msg_id);
        if folder.exists() {
            let _ = std::fs::remove_dir_all(folder);
        }
        // Save to ignored_emails to prevent infinite re-ingestion loop
        let _ = conn.execute(
            "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
            params![msg_id],
        );
        let msg_id_trimmed = msg_id.trim_matches(|c| c == '<' || c == '>');
        let _ = conn.execute(
            "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
            params![msg_id_trimmed],
        );
    }

    let _ = conn.execute("DELETE FROM pending_email_alerts WHERE suggested_case_id IS NULL OR confidence = 0.0", []);

    // After the cleanup, so a re-scored alert is never a candidate for deletion.
    match refresh_alert_suggestions(&conn) {
        Ok(n) if n > 0 => println!("[Rust Backend] refreshed {n} alert suggestion(s)"),
        Err(e) => eprintln!("[Rust Backend] could not refresh alert suggestions: {e}"),
        _ => {}
    }

    let mut stmt = conn
        .prepare("SELECT id, message_id, sender, subject, body_snippet, body_text, received_at, suggested_case_id, confidence, reason, attachments_json FROM pending_email_alerts ORDER BY id DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |r| {
        Ok(PendingAlert {
            id: r.get(0)?,
            message_id: r.get(1)?,
            sender: r.get(2)?,
            subject: r.get(3)?,
            body_snippet: r.get(4)?,
            body_text: r.get(5)?,
            received_at: r.get(6)?,
            suggested_case_id: r.get(7)?,
            confidence: r.get(8)?,
            reason: r.get(9).unwrap_or_default(),
            attachments_json: r.get::<_, Option<String>>(10)?.unwrap_or_else(|| "[]".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let alert = row.map_err(|e| e.to_string())?;
        let is_spam = is_transactional_or_spam(&alert.sender, &alert.subject);

        if is_spam {
            let folder = staging_base.join(&alert.message_id);
            if folder.exists() {
                let _ = std::fs::remove_dir_all(folder);
            }
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
                params![alert.message_id],
            );
            let msg_id_trimmed = alert.message_id.trim_matches(|c| c == '<' || c == '>');
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
                params![msg_id_trimmed],
            );
            let _ = conn.execute(
                "DELETE FROM pending_email_alerts WHERE id = ?1",
                params![alert.id],
            );
        } else {
            list.push(alert);
        }
    }
    println!("[Rust Backend] list_pending_email_alerts returning {} alerts", list.len());
    Ok(list)
}

#[tauri::command]
pub async fn confirm_email_alert(app: AppHandle, alert_id: i64, case_id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    
    // 1. Get alert info
    let alert: PendingAlert = conn.query_row(
        "SELECT id, message_id, sender, subject, body_snippet, body_text, received_at, attachments_json FROM pending_email_alerts WHERE id = ?1",
        params![alert_id],
        |r| {
            Ok(PendingAlert {
                id: r.get(0)?,
                message_id: r.get(1)?,
                sender: r.get(2)?,
                subject: r.get(3)?,
                body_snippet: r.get(4)?,
                body_text: r.get(5)?,
                received_at: r.get(6)?,
                suggested_case_id: None,
                confidence: 0.0,
                reason: String::new(),
                attachments_json: r.get(7).unwrap_or_else(|_| "[]".to_string()),
            })
        }
    ).map_err(|e| format!("Failed to find alert: {e}"))?;

    // 2. Get case folder.
    //
    // Soft-deleted cases are rejected: `list_cases` hides them, so an email linked to one
    // is filed where the UI can never show it and simply looks lost. Checked here rather
    // than only in the caller because this is the sole path that writes `case_emails`.
    let (folder_path, deleted): (String, i64) = conn.query_row(
        "SELECT folder, COALESCE(deleted, 0) FROM cases WHERE id = ?1",
        params![case_id],
        |r| Ok((r.get(0)?, r.get(1)?))
    ).map_err(|e| format!("Failed to find case folder: {e}"))?;
    if deleted != 0 {
        return Err(format!(
            "Case {case_id} has been deleted — pick an open case for this email."
        ));
    }
    let case_folder = Path::new(&folder_path);

    // 3. Move staged attachments to case folder's attachments directory
    let staged_attachments: Vec<AttachmentMetadata> = serde_json::from_str(&alert.attachments_json)
        .unwrap_or_default();
    
    let attachments_dir = case_folder.join(".attachments");
    std::fs::create_dir_all(&attachments_dir)
        .map_err(|e| format!("Failed to create attachments folder: {e}"))?;

    let mut case_attachments = Vec::new();
    for att in staged_attachments {
        let src_path = Path::new(&att.staged_path);
        if src_path.exists() {
            let dest_path = attachments_dir.join(&att.name);
            std::fs::copy(src_path, &dest_path)
                .map_err(|e| format!("Failed to copy attachment {}: {e}", att.name))?;
            
            case_attachments.push(AttachmentMetadata {
                name: att.name.clone(),
                staged_path: dest_path.to_string_lossy().to_string(),
                size_kb: att.size_kb,
                is_imported: None,
            });

            // Same helper the Add Document paths use, so an attachment filed onto a case
            // is indexed and linked exactly like a document added by hand.
            crate::indexer::index_case_file_in_background(
                &app,
                dest_path.to_string_lossy().to_string(),
            );
        }
    }

    // 4. Save email to case_emails
    let attachments_json = serde_json::to_string(&case_attachments).unwrap_or_else(|_| "[]".to_string());
    
    // Check configuration to determine email direction (incoming vs outgoing)
    let email_config = get_email_settings(app.clone())?;
    let direction = if let Some(ref conf) = email_config {
        if alert.sender.to_lowercase().contains(&conf.username.to_lowercase()) {
            "outgoing"
        } else {
            "incoming"
        }
    } else {
        "incoming"
    };

    let final_body = alert.body_text.clone().unwrap_or_else(|| alert.body_snippet.clone());

    conn.execute(
        "INSERT INTO case_emails (case_id, message_id, sender, recipient, subject, body_text, direction, received_at, attachments_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            case_id,
            alert.message_id,
            alert.sender,
            email_config.map(|c| c.username).unwrap_or_default(),
            alert.subject,
            final_body,
            direction,
            alert.received_at,
            attachments_json
        ]
    ).map_err(|e| format!("Failed to insert case email: {e}"))?;

    // Teach the matcher from this confirmation: the sender now belongs to this case and
    // the message id anchors future replies. Best-effort — never fail a confirmation.
    if let Err(e) = crate::case::identifiers::learn_from_confirmed_email(
        &conn,
        case_id,
        &alert.sender,
        &alert.message_id,
    ) {
        eprintln!("[case matcher] could not learn from confirmed email: {e}");
    }

    // 5. Clean up pending alert & staged directory
    conn.execute("DELETE FROM pending_email_alerts WHERE id = ?1", params![alert_id]).map_err(|e| e.to_string())?;
    
    let staging_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("email_staging")
        .join(&alert.message_id);
    if staging_dir.exists() {
        let _ = std::fs::remove_dir_all(staging_dir);
    }

    println!("[Rust Backend] Email alert {} confirmed and moved to case {}. Emitting event...", alert_id, case_id);
    let _ = app.emit("case-emails-updated", case_id);

    Ok(())
}

#[tauri::command]
pub fn delete_email_alert(app: AppHandle, alert_id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    
    // Get message_id for folder cleanup
    let message_id: String = conn.query_row(
        "SELECT message_id FROM pending_email_alerts WHERE id = ?1",
        params![alert_id],
        |r| r.get(0)
    ).map_err(|e| e.to_string())?;

    // Save to ignored_emails to prevent infinite re-ingestion loop
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
        params![message_id],
    );
    let message_id_trimmed = message_id.trim_matches(|c| c == '<' || c == '>');
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
        params![message_id_trimmed],
    );

    conn.execute("DELETE FROM pending_email_alerts WHERE id = ?1", params![alert_id]).map_err(|e| e.to_string())?;

    // Clean up staged folder
    let staging_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("email_staging")
        .join(message_id);
    if staging_dir.exists() {
        let _ = std::fs::remove_dir_all(staging_dir);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::matcher_schema::init_matcher_schema;
    use rusqlite::Connection;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, subject TEXT, name TEXT, folder TEXT, deleted INTEGER DEFAULT 0);
             CREATE TABLE case_fields (case_id INTEGER, field_name TEXT, field_value TEXT);
             CREATE TABLE case_annotations (case_id INTEGER PRIMARY KEY, notes TEXT);
             CREATE TABLE documents (id INTEGER PRIMARY KEY, file_path TEXT, title TEXT);
             CREATE TABLE case_emails (id INTEGER PRIMARY KEY, case_id INTEGER, message_id TEXT);
             CREATE TABLE pending_email_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT, sender TEXT, subject TEXT,
                body_snippet TEXT, body_text TEXT, received_at TEXT, suggested_case_id INTEGER,
                confidence REAL, reason TEXT, attachments_json TEXT, in_reply_to TEXT,
                references_ids TEXT);",
        )
        .unwrap();
        init_matcher_schema(&conn).unwrap();
        conn
    }

    fn add_case(conn: &Connection, id: i64, subject: &str) {
        conn.execute(
            "INSERT INTO cases (id, subject, name) VALUES (?1, ?2, 'client')",
            params![id, subject],
        )
        .unwrap();
        crate::case::case_text_index::rebuild_case_text_fts(conn, id).unwrap();
    }

    fn add_alert(conn: &Connection, subject: &str, suggested: i64) -> i64 {
        conn.execute(
            "INSERT INTO pending_email_alerts
                (message_id, sender, subject, body_snippet, body_text, received_at,
                 suggested_case_id, confidence, reason, attachments_json)
             VALUES ('<m@x>', 'a@b.com', ?1, '', '', 'now', ?2, 0.5, 'stale', '[]')",
            params![subject, suggested],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn suggestion_of(conn: &Connection, id: i64) -> Option<i64> {
        conn.query_row(
            "SELECT suggested_case_id FROM pending_email_alerts WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap()
    }

    /// The reported symptom: restarting the app kept showing a suggestion computed by the
    /// old matcher, because it was frozen into the row at ingestion.
    #[test]
    fn a_stale_suggestion_is_recomputed() {
        let conn = db();
        add_case(&conn, 29, "כל מסמכי התבנית");
        add_case(&conn, 35, "pdf tests");
        let alert = add_alert(&conn, "כל מסמכי התבנית", 35);

        assert_eq!(refresh_alert_suggestions(&conn).unwrap(), 1);
        assert_eq!(suggestion_of(&conn, alert), Some(29));
    }

    /// Clearing a suggestion would let the caller's spam cleanup delete the alert, losing
    /// a queued email to a scoring change.
    #[test]
    fn a_suggestion_is_never_cleared_when_nothing_matches() {
        let conn = db();
        add_case(&conn, 35, "pdf tests");
        let alert = add_alert(&conn, "totally unrelated newsletter", 35);

        refresh_alert_suggestions(&conn).unwrap();
        assert_eq!(suggestion_of(&conn, alert), Some(35), "must not be cleared");
    }

    #[test]
    fn an_already_correct_suggestion_is_left_alone() {
        let conn = db();
        add_case(&conn, 29, "כל מסמכי התבנית");
        let alert = add_alert(&conn, "כל מסמכי התבנית", 29);

        assert_eq!(refresh_alert_suggestions(&conn).unwrap(), 0, "no needless write");
        assert_eq!(suggestion_of(&conn, alert), Some(29));
    }

    #[test]
    fn no_alerts_is_not_an_error() {
        assert_eq!(refresh_alert_suggestions(&db()).unwrap(), 0);
    }
}
