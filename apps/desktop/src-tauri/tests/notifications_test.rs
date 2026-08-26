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

#[test]
fn insert_and_get_notification_round_trip() {
    let conn = setup_test_db("insert_get");
    let id = store::insert_notification(&conn, "task_due", "Task due", "Body text", Some("{\"route\":\"/x\"}")).unwrap();
    let row = store::get_notification(&conn, id).unwrap();
    assert_eq!(row.category, "task_due");
    assert_eq!(row.title, "Task due");
    assert_eq!(row.status, "unread");
    assert_eq!(row.click_target.as_deref(), Some("{\"route\":\"/x\"}"));
}

#[test]
fn list_notifications_excludes_deleted_and_future_snoozes() {
    let conn = setup_test_db("list");
    let id1 = store::insert_notification(&conn, "task_due", "A", "a", None).unwrap();
    let id2 = store::insert_notification(&conn, "task_due", "B", "b", None).unwrap();
    store::update_notification_status(&conn, id2, "deleted").unwrap();
    let id3 = store::insert_notification(&conn, "task_due", "C", "c", None).unwrap();
    store::snooze_notification(&conn, id3, "2099-01-01T00:00:00Z").unwrap();

    let active = store::list_notifications(&conn, None).unwrap();
    let active_ids: Vec<i64> = active.iter().map(|r| r.id).collect();
    assert!(active_ids.contains(&id1));
    assert!(!active_ids.contains(&id2), "deleted notification should not appear in the default view");
    assert!(!active_ids.contains(&id3), "notification snoozed into the future should not appear");
}

#[test]
fn list_notifications_with_status_filter_ignores_snooze() {
    let conn = setup_test_db("list_filtered");
    let id = store::insert_notification(&conn, "task_due", "A", "a", None).unwrap();
    store::update_notification_status(&conn, id, "closed").unwrap();
    let closed = store::list_notifications(&conn, Some("closed")).unwrap();
    assert_eq!(closed.iter().map(|r| r.id).collect::<Vec<_>>(), vec![id]);
}

#[test]
fn update_notification_status_changes_status() {
    let conn = setup_test_db("update_status");
    let id = store::insert_notification(&conn, "email_arrived", "E", "e", None).unwrap();
    store::update_notification_status(&conn, id, "closed").unwrap();
    assert_eq!(store::get_notification(&conn, id).unwrap().status, "closed");
}

#[test]
fn ensure_settings_row_is_idempotent_with_correct_per_category_defaults() {
    let conn = setup_test_db("ensure_settings");
    store::ensure_notification_settings_row(&conn, "task_due").unwrap();
    store::ensure_notification_settings_row(&conn, "task_due").unwrap(); // second call must not error or duplicate

    let all = store::list_notification_settings(&conn).unwrap();
    assert_eq!(all.iter().filter(|r| r.category == "task_due").count(), 1);

    let task_row = store::get_notification_settings_for_category(&conn, "task_due").unwrap();
    assert!(task_row.in_app_enabled);
    assert!(task_row.os_toast_enabled, "task_due should default OS toast on");

    store::ensure_notification_settings_row(&conn, "email_arrived").unwrap();
    let email_row = store::get_notification_settings_for_category(&conn, "email_arrived").unwrap();
    assert!(email_row.in_app_enabled);
    assert!(!email_row.os_toast_enabled, "email_arrived should default OS toast off");
}

#[test]
fn update_notification_settings_persists_and_creates_row_if_missing() {
    let conn = setup_test_db("update_settings");
    store::update_notification_settings(&conn, "email_arrived", true, true).unwrap();
    let row = store::get_notification_settings_for_category(&conn, "email_arrived").unwrap();
    assert!(row.os_toast_enabled);
}

use tauri_app_lib::notifications::task_scanner::tasks_entering_window;
use tauri_app_lib::store::TaskRow;

fn sample_task(id: i64, due_date: Option<&str>, status: &str) -> TaskRow {
    TaskRow {
        id,
        case_id: 1,
        title: "T".to_string(),
        description: None,
        status: status.to_string(),
        estimate_value: None,
        estimate_unit: None,
        due_date: due_date.map(|s| s.to_string()),
        task_template_item_id: None,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        updated_at: None,
        sort_order: 0,
    }
}

#[test]
fn tasks_entering_window_includes_today_and_overdue_excludes_future_and_none() {
    let tasks = vec![
        sample_task(1, Some("2026-08-25"), "Waiting"), // due today
        sample_task(2, Some("2026-08-20"), "Waiting"), // overdue
        sample_task(3, Some("2026-09-01"), "Waiting"), // future -- excluded
        sample_task(4, None, "Waiting"),               // no due date -- excluded
    ];
    let due = tasks_entering_window(&tasks, "2026-08-25");
    assert_eq!(due.iter().map(|t| t.id).collect::<Vec<_>>(), vec![1, 2]);
}

#[test]
fn tasks_entering_window_excludes_done_and_cancelled_tasks() {
    let tasks = vec![
        sample_task(1, Some("2026-08-20"), "Waiting"),
        sample_task(2, Some("2026-08-20"), "Done"),
        sample_task(3, Some("2026-08-20"), "Cancel"),
        sample_task(4, Some("2026-08-25"), "Done"),
        sample_task(5, Some("2026-08-25"), "In Progress"),
    ];
    let due = tasks_entering_window(&tasks, "2026-08-25");
    assert_eq!(
        due.iter().map(|t| t.id).collect::<Vec<_>>(),
        vec![1, 5],
        "resolved tasks must not re-notify even when their due date has passed"
    );
}

#[test]
fn list_notifications_excludes_categories_with_in_app_disabled() {
    let conn = setup_test_db("in_app_disabled");
    let id = store::insert_notification(&conn, "email_arrived", "E", "e", None).unwrap();
    store::update_notification_settings(&conn, "email_arrived", false, false).unwrap();

    let active_ids: Vec<i64> = store::list_notifications(&conn, None).unwrap().iter().map(|r| r.id).collect();
    assert!(!active_ids.contains(&id), "in-app-disabled category should not appear in the bell");

    let unread_ids: Vec<i64> = store::list_notifications(&conn, Some("unread")).unwrap().iter().map(|r| r.id).collect();
    assert!(unread_ids.contains(&id), "an explicit status filter must still return the row");
}
