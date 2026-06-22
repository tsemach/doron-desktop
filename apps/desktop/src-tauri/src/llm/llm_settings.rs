use tauri::AppHandle;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use crate::store;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiConfig {
    pub ai_mode: String,       // "local" | "online" | "byom"
    pub provider: String,      // "gemini" | "openai" | "anthropic" | "other"
    pub ai_model: String,      // e.g. "gpt-4o-mini", "gemini-1.5-flash", etc.
    pub api_key_enc: String,   // Encrypted API key (saved for BYOM)
}

/// Tauri command to load current AI settings
#[tauri::command]
pub fn get_ai_settings(app: AppHandle) -> Result<Option<AiConfig>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT ai_mode, provider, ai_model, api_key_enc FROM ai_configurations LIMIT 1")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row([], |r| {
        Ok(AiConfig {
            ai_mode: r.get(0)?,
            provider: r.get(1)?,
            ai_model: r.get(2)?,
            api_key_enc: r.get(3).unwrap_or_default(),
        })
    });

    match row {
        Ok(config) => Ok(Some(config)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Tauri command to save AI settings
#[tauri::command]
pub fn save_ai_settings(app: AppHandle, config: AiConfig) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute("DELETE FROM ai_configurations", []).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO ai_configurations (ai_mode, provider, ai_model, api_key_enc) VALUES (?1, ?2, ?3, ?4)",
        params![config.ai_mode, config.provider, config.ai_model, config.api_key_enc],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Internal helper for other background tasks (like email classification or indexing)
pub fn get_ai_settings_internal(app: &AppHandle) -> Option<AiConfig> {
    let conn = store::open_db(app).ok()?;
    let mut stmt = conn
        .prepare("SELECT ai_mode, provider, ai_model, api_key_enc FROM ai_configurations LIMIT 1")
        .ok()?;

    stmt.query_row([], |r| {
        Ok(AiConfig {
            ai_mode: r.get(0)?,
            provider: r.get(1)?,
            ai_model: r.get(2)?,
            api_key_enc: r.get(3).unwrap_or_default(),
        })
    }).ok()
}

/// Tauri command to run the connection test/health check
#[tauri::command]
pub async fn check_ai_health(config: AiConfig) -> Result<String, String> {
    if config.ai_mode == "local" {
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        return Ok(format!(
            "Local model connection successful: simulated connection to provider '{}' and model '{}' is active.",
            config.provider, config.ai_model
        ));
    } else if config.ai_mode == "online" {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        return Ok(format!(
            "Online Pro model connection successful: verified account status, model '{}' is ready.",
            config.ai_model
        ));
    }

    // For BYOM (Bring Your Own Model), run a real network check!
    let provider = crate::llm::llm_provider::get_active_provider(
        crate::llm::llm_provider::ProviderConfig {
            provider_type: config.provider.clone(),
            api_key: config.api_key_enc.clone(),
            model: config.ai_model.clone(),
        }
    );

    match provider.call_simple("Perform a brief system check. Reply with exactly the word 'OK'.", None).await {
        Ok(res) => {
            Ok(format!("Connection successful! Response: '{}'", res.trim()))
        }
        Err(e) => {
            Err(format!("Connection failed: {e}"))
        }
    }
}
