use rusqlite::Connection;
use tauri_app_lib::store;

fn setup_test_db(name: &str) -> Connection {
    let db_path = std::env::temp_dir().join(format!("notifications_test_{name}.db"));
    if db_path.exists() {
        let _ = std::fs::remove_file(&db_path);
    }
    store::open_db_by_path(&db_path).expect("should open full-schema test db")
}

#[test]
fn notifications_tables_exist() {
    let conn = setup_test_db("tables_exist");
    for table in ["notifications", "notification_settings"] {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name = ?1",
                rusqlite::params![table],
                |r| r.get(0),
            )
            .unwrap();
        assert!(n > 0, "{table} was not created");
    }
}
