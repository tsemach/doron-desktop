use std::path::{Path, PathBuf};
use rusqlite::params;
use tauri::{AppHandle, Manager, Emitter};

use crate::store;
use super::types::{PendingAlert, AttachmentMetadata};
use super::emails_ops::is_transactional_or_spam;
use super::get_email_settings;

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

    let _ = conn.execute("DELETE FROM pending_email_alerts WHERE suggested_case_id IS NULL OR confidence = 0.0", []);

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

    // 2. Get case folder
    let folder_path: String = conn.query_row(
        "SELECT folder FROM cases WHERE id = ?1",
        params![case_id],
        |r| r.get(0)
    ).map_err(|e| format!("Failed to find case folder: {e}"))?;
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

            // Trigger document indexing asynchronously
            let app_clone = app.clone();
            let dest_path_str = dest_path.to_string_lossy().to_string();
            tauri::async_runtime::spawn(async move {
                let _ = crate::indexer::index_file(
                    app_clone,
                    dest_path_str,
                    String::new(),
                    Some("claude-3-5-sonnet-20241022".to_string()),
                    Some(false),
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
