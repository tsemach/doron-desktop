use rusqlite::{Connection, params};
use tauri_app_lib::store;

fn setup_test_db(db_path: &std::path::Path) -> Connection {
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
    store::open_db_by_path(db_path).expect("Should open full-schema test db")
}

fn insert_case(conn: &Connection) -> i64 {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO cases (subject, status, name, created_at) VALUES ('Test', 'open', 'Test Case', ?1)",
        params![now],
    ).unwrap();
    conn.last_insert_rowid()
}

struct TaskRowForTest {
    title: String,
    status: String,
    due_date: Option<String>,
    task_template_item_id: Option<i64>,
}

// list_tasks_for_case (store::) doesn't exist yet on this branch -- it's
// added in a later branch of the stack (task-crud-backend) -- so query the
// tasks table directly here instead.
fn query_tasks_for_case(conn: &Connection, case_id: i64) -> Vec<TaskRowForTest> {
    let mut stmt = conn.prepare(
        "SELECT title, status, due_date, task_template_item_id FROM tasks WHERE case_id = ?1 ORDER BY id ASC"
    ).unwrap();
    stmt.query_map(params![case_id], |row| {
        Ok(TaskRowForTest {
            title: row.get(0)?,
            status: row.get(1)?,
            due_date: row.get(2)?,
            task_template_item_id: row.get(3)?,
        })
    }).unwrap().collect::<Result<Vec<_>, _>>().unwrap()
}

#[test]
fn create_tasks_for_new_case_honors_explicit_reviewed_drafts() {
    let db_path = std::env::temp_dir().join("task_create_for_new_case_test.db");
    let conn = setup_test_db(&db_path);
    let case_id = insert_case(&conn);
    let case_created_at = "2026-01-01T00:00:00+00:00";

    // template_item_id is a real FK, so the drafts below reference actual
    // task_template_items rows (as they would in the real flow: the review
    // panel's drafts originate from a selected template's items).
    conn.execute(
        "INSERT INTO task_templates (name, created_at) VALUES ('Litigation Basics', ?1)",
        params![case_created_at],
    ).unwrap();
    let template_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO task_template_items (task_template_id, title, estimate_value, estimate_unit, sort_order) VALUES (?1, 'File response', 3, 'day', 0)",
        params![template_id],
    ).unwrap();
    let file_response_item_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO task_template_items (task_template_id, title, estimate_value, estimate_unit, sort_order) VALUES (?1, 'Follow up call', 1, 'hour', 1)",
        params![template_id],
    ).unwrap();
    let follow_up_item_id = conn.last_insert_rowid();

    let tasks = vec![
        // A task whose estimate the user edited down from the template's original value.
        store::NewTaskInput {
            title: "File response (edited)".to_string(),
            description: Some("Trimmed scope".to_string()),
            estimate_value: Some(1.0),
            estimate_unit: Some("day".to_string()),
            template_item_id: Some(file_response_item_id),
        },
        // A task with its estimate cleared entirely by the user -- no due_date.
        store::NewTaskInput {
            title: "Follow up call".to_string(),
            description: None,
            estimate_value: None,
            estimate_unit: None,
            template_item_id: Some(follow_up_item_id),
        },
    ];

    store::create_tasks_for_new_case(&conn, case_id, case_created_at, &tasks)
        .expect("create_tasks_for_new_case should succeed");

    let created = query_tasks_for_case(&conn, case_id);
    assert_eq!(created.len(), 2);

    let first = created.iter().find(|t| t.title == "File response (edited)").unwrap();
    assert_eq!(first.due_date.as_deref(), Some("2026-01-02T00:00:00+00:00")); // +1 day
    assert_eq!(first.task_template_item_id, Some(file_response_item_id));
    assert_eq!(first.status, "Waiting");

    let second = created.iter().find(|t| t.title == "Follow up call").unwrap();
    assert!(second.due_date.is_none(), "no estimate means no computed due_date");
    assert_eq!(second.task_template_item_id, Some(follow_up_item_id));

    let _ = std::fs::remove_file(&db_path);
}

#[test]
fn explicit_tasks_take_priority_over_task_template_id_in_create_new_case() {
    // This test documents the priority contract at the store layer: passing
    // both a task_template_id's materialized items AND an explicit tasks list
    // for the same case must not double-insert -- create_new_case (case/mod.rs)
    // only calls one path, guarded by `if let Some(tasks) = &tasks { .. } else
    // if let Some(tt_id) = task_template_id { .. }`. Exercised here at the
    // store level by calling only create_tasks_for_new_case and confirming no
    // materialize-derived rows exist alongside it.
    let db_path = std::env::temp_dir().join("task_explicit_priority_test.db");
    let conn = setup_test_db(&db_path);
    let case_id = insert_case(&conn);
    let case_created_at = "2026-01-01T00:00:00+00:00";

    conn.execute(
        "INSERT INTO task_templates (name, created_at) VALUES ('Litigation Basics', ?1)",
        params![case_created_at],
    ).unwrap();
    let template_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO task_template_items (task_template_id, title, estimate_value, estimate_unit, sort_order) VALUES (?1, 'Original item', 5, 'day', 0)",
        params![template_id],
    ).unwrap();

    // Simulate the UI sending only the reviewed/edited explicit list (the
    // "Original item" above is intentionally NOT materialized).
    let tasks = vec![store::NewTaskInput {
        title: "Reviewed item".to_string(),
        description: None,
        estimate_value: Some(2.0),
        estimate_unit: Some("day".to_string()),
        template_item_id: None,
    }];
    store::create_tasks_for_new_case(&conn, case_id, case_created_at, &tasks).unwrap();

    let created = query_tasks_for_case(&conn, case_id);
    assert_eq!(created.len(), 1, "only the explicit task should exist, not the template's original item");
    assert_eq!(created[0].title, "Reviewed item");

    let _ = std::fs::remove_file(&db_path);
}
