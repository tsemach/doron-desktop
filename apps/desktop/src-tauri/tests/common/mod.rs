#[allow(dead_code)]
pub fn setup_test_db(db_path: &std::path::Path) -> rusqlite::Connection {
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
    let conn = rusqlite::Connection::open(db_path).expect("Should open test db");
    tauri_app_lib::store::init_documents_schema(&conn).expect("Schema init should succeed");
    conn
}
