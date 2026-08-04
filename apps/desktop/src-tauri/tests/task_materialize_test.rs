use rusqlite::{Connection, params};
use tauri_app_lib::store;

fn setup_test_db(db_path: &std::path::Path) -> Connection {
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
    store::open_db_by_path(db_path).expect("Should open full-schema test db")
}

#[test]
fn materialize_tasks_from_template_computes_due_dates_for_day_and_hour_estimates() {
    let db_path = std::env::temp_dir().join("task_materialize_test.db");
    let conn = setup_test_db(&db_path);

    let case_created_at = "2026-01-01T00:00:00+00:00";
    conn.execute(
        "INSERT INTO cases (subject, status, name, created_at) VALUES ('Test', 'open', 'Test Case', ?1)",
        params![case_created_at],
    ).unwrap();
    let case_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO task_templates (name, created_at) VALUES ('Litigation Basics', ?1)",
        params![case_created_at],
    ).unwrap();
    let template_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO task_template_items (task_template_id, title, estimate_value, estimate_unit, sort_order) VALUES (?1, 'File response', 3, 'day', 0)",
        params![template_id],
    ).unwrap();
    conn.execute(
        "INSERT INTO task_template_items (task_template_id, title, estimate_value, estimate_unit, sort_order) VALUES (?1, 'Prep half-day', 0.5, 'day', 1)",
        params![template_id],
    ).unwrap();
    conn.execute(
        "INSERT INTO task_template_items (task_template_id, title, estimate_value, estimate_unit, sort_order) VALUES (?1, 'Callback', 4, 'hour', 2)",
        params![template_id],
    ).unwrap();

    store::materialize_tasks_from_template(&conn, case_id, template_id, case_created_at)
        .expect("materialize should succeed");

    let mut stmt = conn.prepare(
        "SELECT title, status, estimate_value, estimate_unit, due_date, task_template_item_id
         FROM tasks WHERE case_id = ?1 ORDER BY id ASC"
    ).unwrap();
    let rows: Vec<(String, String, f64, String, String, i64)> = stmt
        .query_map(params![case_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        }).unwrap()
        .collect::<Result<Vec<_>, _>>().unwrap();

    assert_eq!(rows.len(), 3);

    assert_eq!(rows[0].0, "File response");
    assert_eq!(rows[0].1, "Waiting");
    assert_eq!(rows[0].2, 3.0);
    assert_eq!(rows[0].3, "day");
    assert_eq!(rows[0].4, "2026-01-04T00:00:00+00:00"); // +3 days

    assert_eq!(rows[1].2, 0.5);
    assert_eq!(rows[1].3, "day");
    assert_eq!(rows[1].4, "2026-01-01T12:00:00+00:00"); // +0.5 day = +12h

    assert_eq!(rows[2].2, 4.0);
    assert_eq!(rows[2].3, "hour");
    assert_eq!(rows[2].4, "2026-01-01T04:00:00+00:00"); // +4h

    // task_template_item_id back-references are set (traceability), not left NULL.
    assert!(rows[0].5 > 0);
    assert!(rows[1].5 > 0);
    assert!(rows[2].5 > 0);

    let _ = std::fs::remove_file(&db_path);
}
