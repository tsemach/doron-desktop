use std::path::{Path, PathBuf};
use std::collections::HashMap;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Emitter};
use native_tls::TlsConnector;

use crate::store;
use crate::embeddings;
use crate::llm::llm_provider::{get_active_provider, ProviderConfig};

// ── Structs ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EmailConfig {
    pub imap_server: String,
    pub imap_port: u16,
    pub username: String,
    pub password_enc: String,
    pub provider: String,
    pub api_key_enc: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PendingAlert {
    pub id: i64,
    pub message_id: String,
    pub sender: String,
    pub subject: String,
    pub body_snippet: String,
    pub received_at: String,
    pub suggested_case_id: Option<i64>,
    pub confidence: f64,
    pub reason: String,
    pub attachments_json: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CaseEmail {
    pub id: i64,
    pub case_id: i64,
    pub message_id: String,
    pub sender: String,
    pub recipient: String,
    pub subject: String,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub direction: String,
    pub received_at: String,
    pub attachments_json: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AttachmentMetadata {
    name: String,
    staged_path: String,
    size_kb: i64,
}

struct AttachmentData {
    filename: String,
    bytes: Vec<u8>,
    size_kb: i64,
}

#[derive(Deserialize)]
struct MatchResult {
    suggested_case_id: Option<i64>,
    confidence: f64,
    reason: String,
}

// ── Tauri Commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_email_settings(app: AppHandle) -> Result<Option<EmailConfig>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT imap_server, imap_port, username, password_enc, provider, api_key_enc FROM email_configurations LIMIT 1")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row([], |r| {
        Ok(EmailConfig {
            imap_server: r.get(0)?,
            imap_port: r.get(1)?,
            username: r.get(2)?,
            password_enc: r.get(3)?,
            provider: r.get(4)?,
            api_key_enc: r.get(5).unwrap_or_default(),
        })
    });

    match row {
        Ok(config) => Ok(Some(config)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_email_settings(app: AppHandle, config: EmailConfig) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute("DELETE FROM email_configurations", []).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO email_configurations (imap_server, imap_port, username, password_enc, provider, api_key_enc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            config.imap_server,
            config.imap_port,
            config.username,
            config.password_enc,
            config.provider,
            config.api_key_enc
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
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
    }

    conn.execute("DELETE FROM pending_email_alerts WHERE suggested_case_id IS NULL OR confidence = 0.0", [])
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, message_id, sender, subject, body_snippet, received_at, suggested_case_id, confidence, reason, attachments_json FROM pending_email_alerts ORDER BY id DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |r| {
        Ok(PendingAlert {
            id: r.get(0)?,
            message_id: r.get(1)?,
            sender: r.get(2)?,
            subject: r.get(3)?,
            body_snippet: r.get(4)?,
            received_at: r.get(5)?,
            suggested_case_id: r.get(6)?,
            confidence: r.get(7)?,
            reason: r.get(8).unwrap_or_default(),
            attachments_json: r.get::<_, Option<String>>(9)?.unwrap_or_else(|| "[]".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let alert = row.map_err(|e| e.to_string())?;
        if is_transactional_or_spam(&alert.sender, &alert.subject) {
            let folder = staging_base.join(&alert.message_id);
            if folder.exists() {
                let _ = std::fs::remove_dir_all(folder);
            }
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
                params![alert.message_id],
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
        "SELECT id, message_id, sender, subject, body_snippet, received_at, attachments_json FROM pending_email_alerts WHERE id = ?1",
        params![alert_id],
        |r| {
            Ok(PendingAlert {
                id: r.get(0)?,
                message_id: r.get(1)?,
                sender: r.get(2)?,
                subject: r.get(3)?,
                body_snippet: r.get(4)?,
                received_at: r.get(5)?,
                suggested_case_id: None,
                confidence: 0.0,
                reason: String::new(),
                attachments_json: r.get(6).unwrap_or_else(|_| "[]".to_string()),
            })
        }
    ).map_err(|e| format!("Failed to find alert: {e}"))?;

    // 2. Get case folder
    let folder_path: String = conn.query_row(
        "SELECT folder FROM cases WHERE id = ?1",
        params![case_id],
        |r| r.get(0)
    ).map_err(|e| format!("Failed to find case folder: {e}"))?;
    let case_folder = Path::new(&folder_path);

    // 3. Move staged attachments to case folder
    let staged_attachments: Vec<AttachmentMetadata> = serde_json::from_str(&alert.attachments_json)
        .unwrap_or_default();
    
    let mut case_attachments = Vec::new();
    for att in staged_attachments {
        let src_path = Path::new(&att.staged_path);
        if src_path.exists() {
            let dest_path = case_folder.join(&att.name);
            std::fs::copy(src_path, &dest_path)
                .map_err(|e| format!("Failed to copy attachment {}: {e}", att.name))?;
            
            case_attachments.push(AttachmentMetadata {
                name: att.name.clone(),
                staged_path: dest_path.to_string_lossy().to_string(),
                size_kb: att.size_kb,
            });

            // Trigger document indexing asynchronously
            let app_clone = app.clone();
            let dest_path_str = dest_path.to_string_lossy().to_string();
            tauri::async_runtime::spawn(async move {
                // If indexer commands are imported, run indexer::index_file
                let _ = crate::indexer::index_file(
                    app_clone,
                    dest_path_str,
                    String::new(), // api_key (empty uses default/env)
                    Some("claude-3-5-sonnet-20241022".to_string()), // default model
                    Some(false), // reindex
                ).await;
            });
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

    conn.execute(
        "INSERT INTO case_emails (case_id, message_id, sender, recipient, subject, body_text, direction, received_at, attachments_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            case_id,
            alert.message_id,
            alert.sender,
            email_config.map(|c| c.username).unwrap_or_default(),
            alert.subject,
            alert.body_snippet, // Storing snippet as text body for simplicity
            direction,
            alert.received_at,
            attachments_json
        ]
    ).map_err(|e| format!("Failed to insert case email: {e}"))?;

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
        // Spawn background task to check and ingest emails so it is non-blocking
        tauri::async_runtime::spawn(async move {
            println!("[Rust Backend] Background email ingestion started...");
            match check_and_ingest_emails(&app, &config).await {
                Ok(_) => println!("[Rust Backend] Background email ingestion finished successfully!"),
                Err(e) => println!("[Rust Backend] Background email ingestion error: {}", e),
            }
        });
        Ok(())
    } else {
        Err("Email configurations not found. Please set them up in Settings.".to_string())
    }
}

// ── Ingestion Background Worker ──────────────────────────────────────────────

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

fn get_email_settings_internal(app: &AppHandle) -> Option<EmailConfig> {
    let conn = store::open_db(app).ok()?;
    let mut stmt = conn
        .prepare("SELECT imap_server, imap_port, username, password_enc, provider, api_key_enc FROM email_configurations LIMIT 1")
        .ok()?;

    stmt.query_row([], |r| {
        Ok(EmailConfig {
            imap_server: r.get(0)?,
            imap_port: r.get(1)?,
            username: r.get(2)?,
            password_enc: r.get(3)?,
            provider: r.get(4)?,
            api_key_enc: r.get(5).unwrap_or_default(),
        })
    }).ok()
}

async fn check_and_ingest_emails(app: &AppHandle, config: &EmailConfig) -> Result<(), String> {
    let tls_connector = TlsConnector::builder().build().map_err(|e| e.to_string())?;
    
    // Connect to IMAP
    let client = imap::connect(
        (&config.imap_server[..], config.imap_port),
        &config.imap_server[..],
        &tls_connector
    ).map_err(|e| format!("IMAP connection failed: {e}"))?;

    let mut session = client
        .login(&config.username, &config.password_enc)
        .map_err(|e| format!("IMAP login failed: {}", e.0))?;

    session.select("INBOX").map_err(|e| e.to_string())?;

    // Search for unseen messages from the last 30 days
    let thirty_days_ago = chrono::Utc::now() - chrono::Duration::days(30);
    let imap_date = thirty_days_ago.format("%d-%b-%Y").to_string();
    let search_query = format!("UNSEEN SINCE {}", imap_date);
    
    let mut unseen_seqs: Vec<u32> = session.search(&search_query)
        .map_err(|e| e.to_string())?
        .into_iter()
        .collect();
    if unseen_seqs.is_empty() {
        return Ok(());
    }
    unseen_seqs.sort();

    let conn = store::open_db(app)?;

    // 1. Batch fetch ENVELOPEs in chunks of 100 to check which ones are new
    let mut new_seqs = Vec::new();
    let mut seq_to_msg_id = std::collections::HashMap::new();

    for chunk in unseen_seqs.chunks(100) {
        let query = chunk.iter().map(|s| s.to_string()).collect::<Vec<_>>().join(",");
        let fetches = match session.fetch(&query, "ENVELOPE") {
            Ok(f) => f,
            Err(e) => {
                println!("[IMAP Envelope Fetch Error] {}", e);
                continue;
            }
        };

        for fetch in fetches.iter() {
            let seq = fetch.message;
            let message_id = fetch.envelope()
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
                new_seqs.push(seq);
                seq_to_msg_id.insert(seq, message_id);
            }
        }
    }

    for seq in new_seqs {
        let message_id = match seq_to_msg_id.get(&seq) {
            Some(id) => id.clone(),
            None => continue,
        };

        // 2. Fetch full RFC822 body for new emails only
        let fetches = match session.fetch(seq.to_string(), "RFC822") {
            Ok(f) => f,
            Err(e) => {
                println!("[IMAP RFC822 Fetch Error] {}", e);
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

        // Parse using mailparse
        let parsed_mail = match mailparse::parse_mail(raw_body) {
            Ok(pm) => pm,
            Err(_) => continue,
        };

        // Extract headers
        let sender = parsed_mail.headers
            .iter()
            .find(|h| h.get_key().to_lowercase() == "from")
            .map(|h| h.get_value())
            .unwrap_or_else(|| "Unknown Sender".to_string());

        let subject = parsed_mail.headers
            .iter()
            .find(|h| h.get_key().to_lowercase() == "subject")
            .map(|h| h.get_value())
            .unwrap_or_else(|| "No Subject".to_string());

        let date_str = parsed_mail.headers
            .iter()
            .find(|h| h.get_key().to_lowercase() == "date")
            .map(|h| h.get_value())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        // Extract body parts & attachments
        let mut text_body = String::new();
        let mut html_body = String::new();
        let mut attachments = Vec::new();
        extract_parts(&parsed_mail, &mut text_body, &mut html_body, &mut attachments);

        let snippet = if text_body.chars().count() > 500 {
            let chunk: String = text_body.chars().take(500).collect();
            format!("{}...", chunk)
        } else {
            text_body.clone()
        };

        // Staging attachments
        let mut staged_attachments = Vec::new();
        let app_staging_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
            .join("email_staging")
            .join(&message_id);
        
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

        let attachments_json = serde_json::to_string(&staged_attachments).unwrap_or_else(|_| "[]".to_string());

        // ── Cascade Classification ──
        let (suggested_case_id, confidence, reason) = run_cascade_classification(
            app,
            config,
            &sender,
            &subject,
            &snippet
        ).await;

        if suggested_case_id.is_some() {
            // Insert into pending alerts
            conn.execute(
                "INSERT INTO pending_email_alerts (message_id, sender, subject, body_snippet, received_at, suggested_case_id, confidence, reason, attachments_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    message_id,
                    sender,
                    subject,
                    snippet,
                    date_str,
                    suggested_case_id,
                    confidence,
                    reason,
                    attachments_json
                ],
            ).ok();

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
            ).ok();
        }
    }

    Ok(())
}

fn extract_parts(part: &mailparse::ParsedMail, text_body: &mut String, html_body: &mut String, attachments: &mut Vec<AttachmentData>) {
    let disposition = part.get_content_disposition();
    let is_attachment = disposition.disposition == mailparse::DispositionType::Attachment 
        || disposition.params.contains_key("filename");

    if is_attachment {
        let filename = disposition.params.get("filename")
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

// ── AI Matcher Cascade ───────────────────────────────────────────────────────

async fn run_cascade_classification(
    app: &AppHandle,
    config: &EmailConfig,
    sender: &str,
    subject: &str,
    snippet: &str
) -> (Option<i64>, f64, String) {
    if is_transactional_or_spam(sender, subject) {
        return (None, 0.0, "Transactional or spam email ignored.".to_string());
    }

    struct CaseCandidate {
        id: i64,
        name: String,
        subject: String,
        folder: String,
    }

    let (cases, query_vector, case_similarities) = {
        let conn = match store::open_db(app) {
            Ok(c) => c,
            Err(_) => return (None, 0.0, "Failed to open database".to_string()),
        };

        // 1. Fetch active cases
        let mut stmt = match conn.prepare("SELECT id, name, subject, folder FROM cases WHERE deleted = 0 OR deleted IS NULL") {
            Ok(s) => s,
            Err(_) => return (None, 0.0, "Database statement error".to_string()),
        };

        let cases_rows = stmt.query_map([], |r| {
            Ok(CaseCandidate {
                id: r.get(0)?,
                name: r.get(1)?,
                subject: r.get(2).unwrap_or_default(),
                folder: r.get(3).unwrap_or_default(),
            })
        });

        let cases: Vec<CaseCandidate> = match cases_rows {
            Ok(rows) => rows.flatten().collect(),
            Err(_) => return (None, 0.0, "Failed to list cases".to_string()),
        };

        if cases.is_empty() {
            return (None, 0.0, "No active cases found in the system".to_string());
        }

        // 2. Step 1: Rough pre-filter using local embeddings
        let combined_input = format!("email subject: {}\nemail sender: {}\nemail body: {}", subject, sender, snippet);
        let query_vector = match embeddings::get_query_embedding(&combined_input) {
            Ok(vec) => vec,
            Err(_) => return (None, 0.0, "Failed to generate query embedding".to_string()),
        };

        let mut case_similarities: HashMap<i64, f32> = HashMap::new();

        // Check similarity against documents associated with cases
        let mut doc_stmt = match conn.prepare("SELECT d.id, d.file_path, c.embedding FROM documents d JOIN document_chunks c ON d.id = c.document_id") {
            Ok(s) => s,
            Err(_) => return (None, 0.0, "Document query error".to_string()),
        };

        let doc_rows = doc_stmt.query_map([], |r| {
            let doc_id: i64 = r.get(0)?;
            let file_path: String = r.get(1)?;
            let embedding_bytes: Vec<u8> = r.get(2)?;
            Ok((doc_id, file_path, embedding_bytes))
        });

        if let Ok(rows) = doc_rows {
            for row in rows.flatten() {
                let (_, file_path, bytes) = row;
                let doc_vector = embeddings::bytes_to_vec(&bytes);
                let similarity = embeddings::cosine_similarity(&query_vector, &doc_vector);

                // Find case matching the file path directory
                let norm_path = file_path.replace('\\', "/");
                for kase in &cases {
                    let norm_folder = kase.folder.replace('\\', "/");
                    if norm_path.starts_with(&norm_folder) {
                        let entry = case_similarities.entry(kase.id).or_insert(0.0);
                        if similarity > *entry {
                            *entry = similarity;
                        }
                    }
                }
            }
        }
        (cases, query_vector, case_similarities)
    };

    // Identify top candidates from embedding checks
    let mut sorted_candidates: Vec<(&i64, &f32)> = case_similarities.iter().collect();
    sorted_candidates.sort_by(|a, b| b.1.partial_cmp(a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Threshold filtering (spams have very low cosine similarity to any legal document)
    let best_local_score = sorted_candidates.first().map(|c| *c.1).unwrap_or(0.0);
    let mut best_direct = 0.0;
    let mut direct_match: Option<i64> = None;
    let mut exact_match_found = false;

    // 1. Direct exact substring match in the email subject first (high efficiency, 100% accurate)
    for kase in &cases {
        let lower_subject = subject.to_lowercase();
        let lower_name = kase.name.to_lowercase();
        let lower_case_subj = kase.subject.to_lowercase();

        if lower_subject.contains(&lower_name) || (!lower_case_subj.is_empty() && lower_subject.contains(&lower_case_subj)) {
            best_direct = 1.0;
            direct_match = Some(kase.id);
            exact_match_found = true;
            break;
        }
    }

    if exact_match_found {
        return (direct_match, 1.0, "High confidence name match (exact substring in subject).".to_string());
    }

    if best_local_score < 0.35 {
        // Double check against case names/subjects directly
        for kase in &cases {
            let name_vec = match embeddings::get_query_embedding(&kase.name) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let sim = embeddings::cosine_similarity(&query_vector, &name_vec);
            if sim > best_direct {
                best_direct = sim;
                direct_match = Some(kase.id);
            }
        }

        if best_direct < 0.40 {
            return (None, 0.0, format!("Rough filtering skipped: similarity index {best_local_score:.2} too low. Unrelated to any case."));
        } else if best_direct > 0.85 {
            return (direct_match, best_direct as f64, "High confidence name match.".to_string());
        }
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

    // 3. Step 2: Verification using provider-agnostic LLM
    if config.api_key_enc.is_empty() {
        // Fallback to highest embedding match if no API key configured
        if best_local_score >= 0.35 || best_direct > 0.85 {
            let best_id = top_cases.first().map(|c| c.id);
            let confidence = if best_local_score >= 0.35 { best_local_score as f64 } else { best_direct as f64 };
            return (best_id, confidence, "Embedding-only classification (API key not configured)".to_string());
        } else {
            return (None, 0.0, "Embedding-only classification (API key not configured - similarity too low)".to_string());
        }
    }

    let provider = get_active_provider(ProviderConfig {
        provider_type: config.provider.clone(),
        api_key: config.api_key_enc.clone(),
        model: String::new(), // uses default model for the chosen provider
    });

    let mut candidate_list = String::new();
    for kase in &top_cases {
        candidate_list.push_str(&format!("- Case ID {}: Name \"{}\", Subject: \"{}\"\n", kase.id, kase.name, kase.subject));
    }

    let system_prompt = "You are a legal file sorter. Compare the incoming email details against the top 3 case candidates. Select the correct matching case ID. If none of the candidates are relevant, or the email is spam/unrelated personal mail, return null. Always output valid JSON inside a structure: {\"suggested_case_id\": number_or_null, \"confidence\": float_0_1, \"reason\": \"explanation\"}.";

    let prompt = format!(
        "INCOMING EMAIL:\nFrom: {}\nSubject: {}\nSnippet: {}\n\nTOP CANDIDATES:\n{}\nDetermine the matching Case ID.",
        sender, subject, snippet, candidate_list
    );

    match provider.call_structured(&prompt, Some(system_prompt)).await {
        Ok(json_res) => {
            // Strip any wrapping braces or markdown formatting if returned
            let cleaned = json_res.trim();
            let start = cleaned.find('{').unwrap_or(0);
            let end = cleaned.rfind('}').unwrap_or(cleaned.len() - 1);
            let clean_json = &cleaned[start..=end];

            match serde_json::from_str::<MatchResult>(clean_json) {
                Ok(res) => (res.suggested_case_id, res.confidence, res.reason),
                Err(e) => (
                    top_cases.first().map(|c| c.id),
                    0.5,
                    format!("Failed parsing matching JSON: {e}. Raw: {json_res}")
                )
            }
        }
        Err(e) => (
            top_cases.first().map(|c| c.id),
            0.5,
            format!("LLM classification API error: {e}. Falling back to embedding search.")
        )
    }
}

fn is_transactional_or_spam(sender: &str, subject: &str) -> bool {
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
    let blocked_subject_keywords = [
        "דף פירוט",
        "חיוב חודשי",
        "פירוט החיובים",
        "חשבונית מס",
        "קבלה",
        "חשבונית/קבלה",
        "פירוט חיוב",
        "אישור תשלום",
        "הוראת קבע",
        "אישור פעולה",
        "תנועה חדשה",
        "הודעת תשלום",
        "החשבונית שלך",
        "הקבלה שלך",
        "newsletter",
        "digest",
        "weekly summary",
        "monthly summary",
        "your account",
        "statement of account",
        "reset password",
        "otp",
        "one-time password",
        "verification code",
        "קוד אימות",
    ];

    for keyword in &blocked_subject_keywords {
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
