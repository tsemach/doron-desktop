use std::path::PathBuf;
use rusqlite::params;
use tauri::{AppHandle, Emitter, Manager};
use native_tls::TlsConnector;

use crate::store;
use super::types::{EmailConfig, AttachmentMetadata, AttachmentData};
use super::emails_ai::run_cascade_classification;

type ImapSession = imap::Session<native_tls::TlsStream<std::net::TcpStream>>;

async fn filter_new_emails(
    app: &AppHandle,
    session: &mut ImapSession,
    unseen_seqs: &[u32],
) -> Result<Vec<(u32, String)>, String> {
    let conn = store::open_db(app)?;
    let mut new_emails = Vec::new();

    for chunk in unseen_seqs.chunks(100) {
        let query = chunk
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let fetches = session
            .fetch(&query, "ENVELOPE")
            .map_err(|e| format!("Failed to fetch envelope: {e}"))?;

        for fetch in fetches.iter() {
            let seq = fetch.message;
            let message_id = fetch
                .envelope()
                .and_then(|e| e.message_id)
                .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
                .unwrap_or_else(|| format!("{}_{}", chrono::Utc::now().timestamp_micros(), seq));

            let message_id_trimmed = message_id.trim_matches(|c| c == '<' || c == '>');

            // Skip if already processed or ignored
            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM pending_email_alerts WHERE message_id = ?1 OR message_id = ?2) OR
                        EXISTS(SELECT 1 FROM case_emails WHERE message_id = ?1 OR message_id = ?2) OR
                        EXISTS(SELECT 1 FROM ignored_emails WHERE message_id = ?1 OR message_id = ?2)",
                params![message_id, message_id_trimmed],
                |r| r.get::<_, i32>(0)
            ).unwrap_or(0) > 0;

            if !exists {
                new_emails.push((seq, message_id));
            }
        }
    }
    Ok(new_emails)
}

async fn ingest_single_email(
    app: &AppHandle,
    config: &EmailConfig,
    session: &mut ImapSession,
    seq: u32,
    message_id: &str,
) -> Result<(), String> {
    // Fetch full RFC822 body for new emails only
    let fetches = session
        .fetch(seq.to_string(), "RFC822")
        .map_err(|e| format!("Failed to fetch RFC822 for sequence {}: {}", seq, e))?;
    
    let fetch = fetches.iter().next().ok_or_else(|| format!("No fetch result for sequence {}", seq))?;

    let raw_body = fetch.body().ok_or_else(|| format!("No body in fetch result for sequence {}", seq))?;

    // Parse using mailparse
    let parsed_mail = mailparse::parse_mail(raw_body).map_err(|e| format!("Failed to parse mail: {}", e))?;

    // Extract headers
    let sender = parsed_mail
        .headers
        .iter()
        .find(|h| h.get_key().to_lowercase() == "from")
        .map(|h| h.get_value())
        .unwrap_or_else(|| "Unknown Sender".to_string());

    let subject = parsed_mail
        .headers
        .iter()
        .find(|h| h.get_key().to_lowercase() == "subject")
        .map(|h| h.get_value())
        .unwrap_or_else(|| "No Subject".to_string());

    let date_str = parsed_mail
        .headers
        .iter()
        .find(|h| h.get_key().to_lowercase() == "date")
        .map(|h| h.get_value())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    // Extract body parts & attachments
    let mut text_body_raw = String::new();
    let mut html_body = String::new();
    let mut attachments = Vec::new();
    extract_parts(
        &parsed_mail,
        &mut text_body_raw,
        &mut html_body,
        &mut attachments,
    );

    let text_body = super::emails_ops::strip_forward_headers(&text_body_raw);

    let snippet = if text_body.chars().count() > 500 {
        let chunk: String = text_body.chars().take(500).collect();
        format!("{}...", chunk)
    } else {
        text_body.clone()
    };

    // Staging attachments
    let mut staged_attachments = Vec::new();
    let app_staging_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("email_staging")
        .join(message_id);

    std::fs::create_dir_all(&app_staging_dir).ok();

    for att in attachments {
        let staged_path = app_staging_dir.join(&att.filename);
        if std::fs::write(&staged_path, &att.bytes).is_ok() {
            staged_attachments.push(AttachmentMetadata {
                name: att.filename,
                staged_path: staged_path.to_string_lossy().to_string(),
                size_kb: att.size_kb,
            });
        }
    }

    let attachments_json =
        serde_json::to_string(&staged_attachments).unwrap_or_else(|_| "[]".to_string());

    // ── Cascade Classification ──
    let (suggested_case_id, confidence, reason) =
        run_cascade_classification(app, config, &sender, &subject, &snippet).await;

    let conn = store::open_db(app)?;

    if suggested_case_id.is_some() {
        // Insert into pending alerts
        conn.execute(
            "INSERT INTO pending_email_alerts (message_id, sender, subject, body_snippet, body_text, received_at, suggested_case_id, confidence, reason, attachments_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                message_id,
                sender,
                subject,
                snippet,
                text_body,
                date_str,
                suggested_case_id,
                confidence,
                reason,
                attachments_json
            ],
        ).map_err(|e| format!("Database insert error: {}", e))?;

        // Emit Tauri window notification event
        let _ = app.emit("new-email-alert", ());
    } else {
        // Clean up staged folder since email is unrelated/spam
        if app_staging_dir.exists() {
            let _ = std::fs::remove_dir_all(&app_staging_dir);
        }
        conn.execute(
            "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
            params![message_id],
        ).map_err(|e| format!("Database ignore insert error: {}", e))?;
    }

    Ok(())
}

async fn heal_truncated_case_emails(app: &AppHandle, session: &mut ImapSession) -> Result<(), String> {
    let conn = store::open_db(app)?;
    let mut stmt = conn
        .prepare("SELECT id, message_id FROM case_emails WHERE body_text LIKE '%...' OR body_text LIKE '%…'")
        .map_err(|e| e.to_string())?;

    let truncated: Vec<(i64, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    if truncated.is_empty() {
        return Ok(());
    }

    println!("[Email Healer] Found {} truncated emails to heal.", truncated.len());

    for (id, msg_id) in truncated {
        let clean_msg_id = msg_id.trim_matches(|c| c == '<' || c == '>');
        let search_query = format!("HEADER Message-ID \"<{}>\"", clean_msg_id);
        println!("[Email Healer] Searching IMAP with query: {}", search_query);

        let seqs = match session.search(&search_query) {
            Ok(s) => s,
            Err(e) => {
                println!("[Email Healer Warning] IMAP search failed for {}: {}", msg_id, e);
                continue;
            }
        };

        let seq = match seqs.iter().next() {
            Some(&s) => s,
            None => {
                println!("[Email Healer Warning] Email not found on IMAP server for Message-ID: {}", msg_id);
                continue;
            }
        };

        let fetches = match session.fetch(seq.to_string(), "RFC822") {
            Ok(f) => f,
            Err(e) => {
                println!("[Email Healer Warning] Failed to fetch RFC822 for sequence {}: {}", seq, e);
                continue;
            }
        };

        let fetch = match fetches.iter().next() {
            Some(f) => f,
            None => continue,
        };

        let raw_body = match fetch.body() {
            Some(b) => b,
            None => continue,
        };

        let parsed_mail = match mailparse::parse_mail(raw_body) {
            Ok(pm) => pm,
            Err(e) => {
                println!("[Email Healer Warning] Failed to parse email body: {}", e);
                continue;
            }
        };

        let mut text_body_raw = String::new();
        let mut html_body = String::new();
        let mut attachments = Vec::new();
        extract_parts(&parsed_mail, &mut text_body_raw, &mut html_body, &mut attachments);

        let text_body = super::emails_ops::strip_forward_headers(&text_body_raw);

        if !text_body.is_empty() {
            println!("[Email Healer] Successfully retrieved full body ({} chars). Updating database.", text_body.len());
            let _ = conn.execute(
                "UPDATE case_emails SET body_text = ?1 WHERE id = ?2",
                params![text_body, id],
            );
            
            if let Ok(case_id) = conn.query_row::<i64, _, _>(
                "SELECT case_id FROM case_emails WHERE id = ?1",
                params![id],
                |r| r.get(0)
            ) {
                let _ = app.emit("case-emails-updated", case_id);
            }
        }
    }

    Ok(())
}

pub async fn check_and_ingest_emails(app: &AppHandle, config: &EmailConfig) -> Result<(), String> {
    let tls_connector = TlsConnector::builder().build().map_err(|e| e.to_string())?;

    // Connect to IMAP
    let client = imap::connect(
        (&config.imap_server[..], config.imap_port),
        &config.imap_server[..],
        &tls_connector,
    )
    .map_err(|e| format!("IMAP connection failed: {e}"))?;

    let mut session = client
        .login(&config.username, &config.password_enc)
        .map_err(|e| format!("IMAP login failed: {}", e.0))?;

    let thirty_days_ago = chrono::Utc::now() - chrono::Duration::days(30);
    let imap_date = thirty_days_ago.format("%d-%b-%Y").to_string();

    // 1. Process INBOX (incoming unseen emails)
    if session.select("INBOX").is_ok() {
        // Heal any existing truncated case emails
        if let Err(e) = heal_truncated_case_emails(app, &mut session).await {
            println!("[Email Healer Error] {}", e);
        }

        let search_query = format!("UNSEEN SINCE {}", imap_date);
        if let Ok(unseen_seqs_iter) = session.search(&search_query) {
            let mut unseen_seqs: Vec<u32> = unseen_seqs_iter.into_iter().collect();
            if !unseen_seqs.is_empty() {
                unseen_seqs.sort();
                if let Ok(new_emails) = filter_new_emails(app, &mut session, &unseen_seqs).await {
                    let mut new_emails = new_emails;
                    new_emails.sort_by(|a, b| b.0.cmp(&a.0));
                    for (seq, message_id) in new_emails {
                        if let Err(e) = ingest_single_email(app, config, &mut session, seq, &message_id).await {
                            println!("[Email Ingestion Error] Failed to ingest sequence {}: {}", seq, e);
                        }
                    }
                }
            }
        }
    }

    // 2. Process Sent Folder (outgoing emails)
    let sent_folders = ["[Gmail]/Sent Mail", "Sent", "Sent Messages", "Sent Items"];
    let mut selected_sent = false;
    for folder in sent_folders {
        if session.select(folder).is_ok() {
            selected_sent = true;
            break;
        }
    }

    if selected_sent {
        let search_query_sent = format!("SINCE {}", imap_date);
        if let Ok(sent_seqs_iter) = session.search(&search_query_sent) {
            let mut sent_seqs: Vec<u32> = sent_seqs_iter.into_iter().collect();
            if !sent_seqs.is_empty() {
                sent_seqs.sort();
                if let Ok(new_sent_emails) = filter_new_emails(app, &mut session, &sent_seqs).await {
                    let mut new_sent_emails = new_sent_emails;
                    new_sent_emails.sort_by(|a, b| b.0.cmp(&a.0));
                    for (seq, message_id) in new_sent_emails {
                        if let Err(e) = ingest_single_email(app, config, &mut session, seq, &message_id).await {
                            println!("[Email Ingestion Error] Failed to ingest sent sequence {}: {}", seq, e);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

fn extract_parts(
    part: &mailparse::ParsedMail,
    text_body: &mut String,
    html_body: &mut String,
    attachments: &mut Vec<AttachmentData>,
) {
    let disposition = part.get_content_disposition();
    let is_attachment = disposition.disposition == mailparse::DispositionType::Attachment
        || disposition.params.contains_key("filename");

    if is_attachment {
        let filename = disposition
            .params
            .get("filename")
            .cloned()
            .unwrap_or_else(|| "unnamed_attachment".to_string());

        let bytes = part.get_body_raw().unwrap_or_default();
        let size_kb = bytes.len() as i64 / 1024;
        attachments.push(AttachmentData {
            filename,
            bytes,
            size_kb,
        });
    } else {
        let mime = part.ctype.mimetype.to_lowercase();
        if mime == "text/plain" {
            if let Ok(text) = part.get_body() {
                text_body.push_str(&text);
            }
        } else if mime == "text/html" {
            if let Ok(html) = part.get_body() {
                html_body.push_str(&html);
            }
        }

        for subpart in &part.subparts {
            extract_parts(subpart, text_body, html_body, attachments);
        }
    }
}
