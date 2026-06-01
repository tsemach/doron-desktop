use tauri::Manager;

pub mod store;
pub mod extractor;
pub mod llm;
pub mod indexer;
pub mod doc_template;
pub mod case_template;
pub mod case;
pub mod query;
pub mod embeddings;

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
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            store::get_db_path,
            indexer::index_folder,
            indexer::index_file,
            query::search_documents,
            // doc_template
            doc_template::process_template,
            doc_template::list_templates,
            doc_template::sync_template_fields,
            doc_template::generate_document_from_template,
            doc_template::delete_template,
            doc_template::open_template_file,
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
            case::list_case_files,
            case::verify_folder_in_use,
            case::get_document_annotations,
            case::set_document_annotations,
            case::delete_document_annotations,
            case::list_all_annotation_tags,
            case::add_file_to_case,
            case::get_case_fields,
            case::save_case_fields,
            case::remove_file_from_case
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
