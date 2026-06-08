use tauri::AppHandle;
use rusqlite::params;

use crate::store;
use super::types::{CaseEmail, BLOCKED_SUBJECT_KEYWORDS};
use super::emails_settings::get_email_settings_internal;
use super::emails_ingestion::check_and_ingest_emails;

#[tauri::command]
pub fn list_case_emails(app: AppHandle, case_id: i64) -> Result<Vec<CaseEmail>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, case_id, message_id, sender, recipient, subject, body_text, body_html, direction, received_at, attachments_json FROM case_emails WHERE case_id = ?1 ORDER BY received_at ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![case_id], |r| {
        Ok(CaseEmail {
            id: r.get(0)?,
            case_id: r.get(1)?,
            message_id: r.get(2)?,
            sender: r.get(3)?,
            recipient: r.get(4)?,
            subject: r.get(5)?,
            body_text: r.get(6)?,
            body_html: r.get(7)?,
            direction: r.get(8)?,
            received_at: r.get(9)?,
            attachments_json: r.get::<_, Option<String>>(10)?.unwrap_or_else(|| "[]".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row.map_err(|e| e.to_string())?);
    }
    Ok(list)
}

#[tauri::command]
pub async fn trigger_email_ingestion(app: AppHandle) -> Result<(), String> {
    println!("[Rust Backend] trigger_email_ingestion called!");
    if let Some(config) = get_email_settings_internal(&app) {
        // Await the check directly so the frontend refresh spinner stays active during the network operation
        check_and_ingest_emails(&app, &config).await?;
        Ok(())
    } else {
        Err("Email configurations not found. Please set them up in Settings.".to_string())
    }
}

pub async fn poll_emails_background(app: AppHandle) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
    loop {
        interval.tick().await;
        if let Some(config) = get_email_settings_internal(&app) {
            if let Err(e) = check_and_ingest_emails(&app, &config).await {
                println!("[Email Background Worker Error] {}", e);
            }
        }
    }
}

pub(crate) fn is_transactional_or_spam(sender: &str, subject: &str) -> bool {
    let s_lower = sender.to_lowercase();
    let subj_lower = subject.to_lowercase();

    // Check sender email/domain blocklist
    let blocked_domains = [
        "calmail",
        "icc.co.il",
        "cal.co.il",
        "leumicard.co.il",
        "max.co.il",
        "isracard.co.il",
        "amex.co.il",
        "americanexpress.co.il",
        "paypal.com",
        "paypal.co.il",
        "linkedin.com",
        "github.com",
        "coursera.org",
        "idealista.com",
        "booking.com",
        "noreply@",
        "no-reply@",
        "donotreply@",
        "do-not-reply@",
        "info@leumicard.co.il",
        "info@cal.co.il",
        "billing@",
        "newsletter@",
        "notification@",
        "notifications@",
        "alert@",
        "alerts@",
    ];

    for domain in &blocked_domains {
        if s_lower.contains(domain) {
            return true;
        }
    }

    // Check subject blocklist (mostly Hebrew credit card/marketing and some English)
    for keyword in BLOCKED_SUBJECT_KEYWORDS {
        if subj_lower.contains(keyword) {
            return true;
        }
    }

    // Double check specific transactional patterns (e.g. Cal / Max statements)
    if s_lower.contains("cal") && subj_lower.contains("פירוט") {
        return true;
    }

    false
}

pub fn strip_forward_headers(body: &str) -> String {
    let mut current_body = body.to_string();
    loop {
        let next_body = strip_forward_headers_single(&current_body);
        if next_body == current_body {
            break;
        }
        current_body = next_body;
    }
    current_body
}

fn strip_forward_headers_single(body: &str) -> String {
    let mut lines: Vec<&str> = body.lines().collect();
    let mut start_idx = None;

    for (i, line) in lines.iter().enumerate() {
        let cleaned = clean_line_for_header_check(line);
        if cleaned.contains("forwarded message")
            || cleaned.contains("הודעה שהועברה")
            || cleaned.contains("הודעה מועברת")
            || cleaned.contains("original message")
        {
            start_idx = Some(i);
            break;
        }
    }

    if let Some(start) = start_idx {
        let mut end = start + 1;
        while end < lines.len() {
            let line = lines[end];
            let trimmed = line.trim();
            if trimmed.is_empty() {
                end += 1;
                continue;
            }
            
            let cleaned = clean_line_for_header_check(line);
            let is_header = cleaned.starts_with("from:")
                || cleaned.starts_with("מאת:")
                || cleaned.starts_with("date:")
                || cleaned.starts_with("תאריך:")
                || cleaned.starts_with("subject:")
                || cleaned.starts_with("נושא:")
                || cleaned.starts_with("to:")
                || cleaned.starts_with("אל:")
                || cleaned.starts_with("cc:")
                || cleaned.starts_with("עותק:")
                || cleaned.starts_with("bcc:");

            if is_header {
                end += 1;
            } else {
                break;
            }
        }

        lines.drain(start..end);
    }

    lines.join("\n")
}

fn clean_line_for_header_check(line: &str) -> String {
    line.chars()
        .skip_while(|c| !c.is_alphanumeric() && *c != '-' && *c != ':')
        .collect::<String>()
        .to_lowercase()
}

#[tauri::command]
pub fn list_case_attachments(app: AppHandle, case_id: i64) -> Result<Vec<super::types::AttachmentMetadata>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT attachments_json FROM case_emails WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![case_id], |r| {
        let json_str: String = r.get(0)?;
        Ok(json_str)
    }).map_err(|e| e.to_string())?;

    let mut all_attachments = Vec::new();
    for row in rows {
        if let Ok(json_str) = row {
            let atts: Vec<super::types::AttachmentMetadata> = serde_json::from_str(&json_str).unwrap_or_default();
            for att in atts {
                if !att.is_imported.unwrap_or(false) {
                    all_attachments.push(att);
                }
            }
        }
    }
    Ok(all_attachments)
}

#[tauri::command]
pub fn remove_attachment(
    app: AppHandle,
    case_id: i64,
    staged_path: String,
    imported_path: Option<String>,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    use tauri::Emitter;

    // 1. Physically delete the file from disk if it exists
    let path = std::path::Path::new(&staged_path);
    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| format!("Failed to delete attachment from disk: {e}"))?;
    }

    // 2. Query all emails for this case
    let mut stmt = conn
        .prepare("SELECT id, attachments_json FROM case_emails WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![case_id], |row| {
        let id: i64 = row.get(0)?;
        let json_str: String = row.get(1)?;
        Ok((id, json_str))
    }).map_err(|e| e.to_string())?;

    // 3. For each email, either mark as imported or filter out completely
    for row in rows {
        if let Ok((id, json_str)) = row {
            let mut atts: Vec<super::types::AttachmentMetadata> = serde_json::from_str(&json_str).unwrap_or_default();
            let mut modified = false;

            if let Some(ref imp_path) = imported_path {
                for att in &mut atts {
                    if att.staged_path == staged_path {
                        att.is_imported = Some(true);
                        att.staged_path = imp_path.clone(); // Point to the new path in case folder
                        modified = true;
                    }
                }
            } else {
                let original_len = atts.len();
                atts.retain(|att| att.staged_path != staged_path);
                if atts.len() != original_len {
                    modified = true;
                }
            }

            if modified {
                let new_json = serde_json::to_string(&atts).unwrap_or_else(|_| "[]".to_string());
                conn.execute(
                    "UPDATE case_emails SET attachments_json = ?1 WHERE id = ?2",
                    params![new_json, id],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    // 4. Emit the updated event so the frontend chat refreshes smoothly
    let _ = app.emit("case-emails-updated", case_id);

    Ok(())
}
