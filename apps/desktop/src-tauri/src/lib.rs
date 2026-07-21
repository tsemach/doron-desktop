use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

pub mod store;
pub mod auth;
pub mod extractor;
pub mod llm;
pub mod indexer;
pub mod doc_template;
pub mod case_template;
pub mod case;
pub mod query;
pub mod embeddings;
pub mod email;
pub mod documents;
pub mod clipboard;
pub mod power;
pub mod tags;
pub mod user_settings;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.center().ok();
                window.maximize().ok();
                window.show().ok();
            }
            // Pre-warm the embedding model in a background thread on startup
            tauri::async_runtime::spawn(async {
                let _ = crate::embeddings::get_embedding_model();
            });
            // Start background email polling worker
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::email::poll_emails_background(handle).await;
            });
            // Spawn local AI sidecar on startup if configured
            let handle_sidecar = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(config) = crate::llm::get_ai_settings_internal(&handle_sidecar) {
                    if config.ai_mode == "local" {
                        println!("[Rust Backend] Starting local AI sidecar on startup for model: {}", config.ai_model);
                        let _ = crate::llm::start_llama_server(&handle_sidecar, &config.ai_model);
                    }
                }
            });
            // OAuth login hand-off (0.9): the backend redirects the system browser to
            // doron-desktop://auth?token=... once a desktop-originated Google/Facebook
            // login completes. Persist that token as the local session the same way
            // password login (auth::login_with_credentials) does.
            // Ensures the doron-desktop:// scheme is registered even for unbundled
            // `tauri dev` runs (Windows/Linux) or an improperly-installed AppImage —
            // production installers already register it from tauri.conf.json at
            // install time, so this is a harmless no-op there. macOS doesn't need
            // this call (handled via Info.plist at bundle time).
            #[cfg(any(windows, target_os = "linux"))]
            if let Err(e) = app.deep_link().register_all() {
                eprintln!("[Rust Backend] Failed to register deep link scheme: {e}");
            }

            let handle_deep_link = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if url.scheme() != "doron-desktop" {
                        continue;
                    }

                    if let Some(window) = handle_deep_link.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }

                    // doron-desktop://login -- sent from the email-verification
                    // confirmation page's "sign in" link when registration
                    // originated on desktop, so it lands the user back on the
                    // desktop's own login form instead of the browser's.
                    // Carries no token: this is a focus+navigate hint only,
                    // not a session hand-off (that stays OAuth-only, below).
                    if url.host_str() == Some("login") {
                        let _ = handle_deep_link.emit("deep-link-navigate", "/auth/login");
                        continue;
                    }

                    let param = |key: &str| {
                        url.query_pairs().find(|(k, _)| k == key).map(|(_, v)| v.to_string())
                    };
                    let (token, email, tier, expires_at) = (param("token"), param("email"), param("tier"), param("expires_at"));
                    if let Err(e) = crate::auth::complete_oauth_login(&handle_deep_link, token, email, tier, expires_at) {
                        eprintln!("[Rust Backend] OAuth deep-link session save failed: {e}");
                    }
                }
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_mic_recorder::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            store::get_db_path,
            indexer::index_folder,
            indexer::index_file,
            indexer::stop_indexing,
            indexer::get_active_indexing_sessions,
            indexer::delete_indexing_session,
            query::query_search_documents,
            doc_template::local_add::process_template,
            doc_template::download::download_and_process_template,
            doc_template::list_templates,
            doc_template::sync_template_fields,
            doc_template::sync_all_templates_fields,
            doc_template::generate_document_from_template,
            doc_template::fill_document_placeholders,
            doc_template::delete_template,
            doc_template::open_path,
            doc_template::context::get_template_field_context,
            // case_template
            case_template::list_case_templates,
            case_template::create_case_template,
            case_template::update_case_template,
            case_template::delete_case_template,
            // case
            case::list_cases,
            case::add_case,
            case::create_new_case,
            case::delete_case,
            case::update_case_status,
            case::list_case_files,
            case::verify_folder_in_use,
            case::get_document_annotations,
            case::set_document_annotations,
            case::delete_document_annotations,
            case::get_case_annotations,
            case::set_case_annotations,
            case::delete_case_annotations,
            case::add_file_to_case,
            case::get_case_fields,
            case::save_case_fields,
            case::save_case_document_fields,
            case::remove_file_from_case,
            case::read_file_bytes,
            // documents versioning
            documents::versioning::start_case_watcher,
            documents::versioning::stop_case_watcher,
            documents::versioning::list_document_versions,
            documents::versioning::restore_document_version,
            documents::versioning::delete_document_version,
            // tags
            tags::add_tag,
            tags::update_tag,
            tags::remove_tag,
            tags::list_tags,
            tags::list_all_tag_names,
            // user settings
            user_settings::get_user_settings,
            user_settings::save_user_settings,
            // auth
            auth::get_session,
            auth::save_session,
            auth::clear_session,
            auth::login_with_credentials,
            // email commands
            email::get_email_settings,
            email::save_email_settings,
            email::list_pending_email_alerts,
            // AI Provider commands
            llm::get_ai_settings,
            llm::save_ai_settings,
            llm::check_ai_health,
            llm::check_local_model_status,
            llm::check_model_downloading,
            llm::cancel_model_download,
            llm::install_local_model,
            llm::delete_local_model,
            llm::stop_llama_server,
            llm::stop_whisper_server,
            llm::transcribe_audio_local,
            llm::transcribe_audio_cloud,
            llm::extract_field_value,
            email::confirm_email_alert,
            email::delete_email_alert,
            email::list_case_emails,
            email::trigger_email_ingestion,
            email::list_case_attachments,
            email::remove_attachment,
            clipboard::read_clipboard,
            clipboard::write_clipboard,
            power::prevent_sleep,
            power::allow_sleep
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                println!("[Rust Backend] Tauri app exiting. Terminating local sidecars...");
                crate::llm::stop_llama_server();
                crate::llm::stop_whisper_server();
            }
        });
}
