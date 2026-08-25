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
