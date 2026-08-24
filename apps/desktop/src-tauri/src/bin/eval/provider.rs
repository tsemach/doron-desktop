use rusqlite::Error as SqliteError;
use tauri_app_lib::llm::llm_provider::{
    get_active_provider, normalize_model_name, BackendOnlineProvider, LlmProvider, MockProvider,
    ProviderConfig,
};
use tauri_app_lib::store;

const SIGN_IN_MESSAGE: &str =
    "No signed-in session found. Sign in via the desktop app first -- provider=online reuses its session, eval has no login flow of its own.";

/// Resolves the eval CLI's `--provider` value into a concrete LlmProvider.
///
/// "online" (AMI-98): there is no independent eval login flow and no
/// api-key-in-Rust story for online mode anymore -- the backend holds the
/// only credentials. Instead this reads the session the desktop app already
/// persisted in documents.db's auth_session table (same app-data dir
/// store::cli_app_data_dir() already points eval's model-file lookups at)
/// and proxies through the backend exactly like the real app's "online"
/// ai_mode (llm_settings.rs::load_active_provider). Sign in via the desktop
/// app first.
///
/// "local": there is no local AI anymore -- callers must force their
/// heuristic-only / no-LLM code paths whenever provider == "local" (see
/// extract_heuristic_metadata / analyze_query_heuristically). The Mock
/// provider is returned as a placeholder that must never actually be
/// invoked for this case.
pub fn resolve_eval_provider(
    provider_type: &str,
    model: &str,
    api_key: Option<String>,
    purpose: &'static str,
) -> Result<LlmProvider, String> {
    match provider_type.to_lowercase().as_str() {
        "online" => resolve_backend_online(model, purpose),
        "local" => Ok(LlmProvider::Mock(MockProvider)),
        _ => Ok(get_active_provider(ProviderConfig {
            provider_type: provider_type.to_string(),
            api_key: api_key.unwrap_or_default(),
            model: model.to_string(),
            base_url: None,
        })),
    }
}

fn resolve_backend_online(model: &str, purpose: &'static str) -> Result<LlmProvider, String> {
    let db_path = store::cli_db_path("documents.db");
    let conn = store::open_db_by_path(&db_path)?;

    let row = conn.query_row(
        "SELECT token, backend_url, expires_at FROM auth_session LIMIT 1",
        [],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
    );

    let (token, backend_url, expires_at) = match row {
        Ok(row) => row,
        Err(SqliteError::QueryReturnedNoRows) => return Err(SIGN_IN_MESSAGE.to_string()),
        Err(e) => return Err(e.to_string()),
    };

    let expired = chrono::DateTime::parse_from_rfc3339(&expires_at)
        .map(|expires| expires.with_timezone(&chrono::Utc) < chrono::Utc::now())
        .unwrap_or(true);
    if expired {
        return Err("Signed-in session has expired. Sign in again via the desktop app.".to_string());
    }

    // Eval has no separate "which underlying provider" flag -- infer it from
    // the model name, mirroring llm_settings.rs::load_active_provider's own
    // fallback heuristic for the same problem (no explicit provider config).
    let inferred_provider = if model.contains("gemini") {
        "gemini"
    } else if model.contains("gpt") {
        "openai"
    } else {
        "claude"
    };

    Ok(LlmProvider::BackendOnline(BackendOnlineProvider {
        backend_url,
        session_token: token,
        provider: inferred_provider.to_string(),
        model: normalize_model_name(model),
        purpose,
    }))
}
