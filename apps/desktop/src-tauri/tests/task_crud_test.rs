use rusqlite::{Connection, params};
use tauri_app_lib::store;

fn setup_test_db(db_path: &std::path::Path) -> Connection {
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
    store::open_db_by_path(db_path).expect("Should open full-schema test db")
}

fn insert_test_case(conn: &Connection) -> i64 {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO cases (subject, status, name, created_at) VALUES ('Test', 'open', 'Test Case', ?1)",
        params![now],
    ).unwrap();
    conn.last_insert_rowid()
}

#[test]
fn task_crud_round_trip() {
    let db_path = std::env::temp_dir().join("task_crud_test.db");
    let conn = setup_test_db(&db_path);
    let case_id = insert_test_case(&conn);

    // Create (ad-hoc, no estimate)
    let created = store::create_task(&conn, case_id, "Kickoff call", None, None, None, None)
        .expect("create_task should succeed");
    assert_eq!(created.status, "Waiting");
    assert_eq!(created.case_id, case_id);
    assert!(created.estimate_value.is_none());
    assert!(created.task_template_item_id.is_none());

    // Create (with estimate + due date)
    let created2 = store::create_task(
        &conn, case_id, "File response", Some("Draft and file"), Some(3.0), Some("day"), Some("2026-01-04T00:00:00+00:00"),
    ).expect("create_task should succeed");

    // List
    let tasks = store::list_tasks_for_case(&conn, case_id).expect("list should succeed");
    assert_eq!(tasks.len(), 2);

    // Update (full edit)
    store::update_task(
        &conn, created.id, "Kickoff call (renamed)", Some("Updated description"),
        Some(1.0), Some("hour"), Some("2026-01-02T00:00:00+00:00"), "In progress",
    ).expect("update_task should succeed");

    let tasks = store::list_tasks_for_case(&conn, case_id).expect("list should succeed");
    let updated = tasks.iter().find(|t| t.id == created.id).unwrap();
    assert_eq!(updated.title, "Kickoff call (renamed)");
    assert_eq!(updated.status, "In progress");
    assert_eq!(updated.estimate_value, Some(1.0));
    assert_eq!(updated.estimate_unit.as_deref(), Some("hour"));
    assert!(updated.updated_at.is_some());

    // Update status only
    store::update_task_status(&conn, created2.id, "Done").expect("update_task_status should succeed");
    let tasks = store::list_tasks_for_case(&conn, case_id).expect("list should succeed");
    let done_task = tasks.iter().find(|t| t.id == created2.id).unwrap();
    assert_eq!(done_task.status, "Done");

    // Invalid status is rejected by the CHECK constraint
    let bad_status = store::update_task_status(&conn, created2.id, "Bogus");
    assert!(bad_status.is_err(), "CHECK constraint should reject an invalid status");

    // Delete
    store::delete_task(&conn, created.id).expect("delete_task should succeed");
    let tasks = store::list_tasks_for_case(&conn, case_id).expect("list should succeed");
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].id, created2.id);

    let _ = std::fs::remove_file(&db_path);
}
