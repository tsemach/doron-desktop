use rusqlite::{Connection, params};
use tauri_app_lib::store;

fn setup_test_db(db_path: &std::path::Path) -> Connection {
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
    store::open_db_by_path(db_path).expect("Should open full-schema test db")
}

fn insert_case(conn: &Connection, subject: &str, name: &str, deleted: i64) -> i64 {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO cases (subject, status, name, created_at, deleted) VALUES (?1, 'open', ?2, ?3, ?4)",
        params![subject, name, now, deleted],
    ).unwrap();
    conn.last_insert_rowid()
}

#[test]
fn list_all_tasks_joins_case_and_excludes_soft_deleted() {
    let db_path = std::env::temp_dir().join("task_list_all_test.db");
    let conn = setup_test_db(&db_path);

    let active_case = insert_case(&conn, "Active Case", "Alice", 0);
    let deleted_case = insert_case(&conn, "Deleted Case", "Bob", 1);

    store::create_task(&conn, active_case, "Task A", None, Some(1.0), Some("day"), Some("2026-01-05T00:00:00+00:00")).unwrap();
    store::create_task(&conn, active_case, "Task B", None, None, None, None).unwrap();
    store::create_task(&conn, deleted_case, "Task C (should be excluded)", None, None, None, None).unwrap();

    let all = store::list_all_tasks(&conn).expect("list_all_tasks should succeed");

    assert_eq!(all.len(), 2, "tasks belonging to a soft-deleted case must be excluded");
    assert!(all.iter().all(|t| t.task.case_id == active_case));
    assert!(all.iter().any(|t| t.task.title == "Task A" && t.case_subject.as_deref() == Some("Active Case") && t.case_name == "Alice"));

    // due_date-having task sorts before the null-due_date one (nulls last)
    assert_eq!(all[0].task.title, "Task A");
    assert_eq!(all[1].task.title, "Task B");

    // #[serde(flatten)] should put task fields at the top level alongside case_subject/case_name
    let json = serde_json::to_value(&all[0]).unwrap();
    assert!(json.get("id").is_some(), "flattened task fields should be top-level");
    assert!(json.get("task").is_none(), "there should be no nested 'task' key");
    assert_eq!(json.get("case_subject").unwrap(), "Active Case");
    assert_eq!(json.get("case_name").unwrap(), "Alice");

    let _ = std::fs::remove_file(&db_path);
}
