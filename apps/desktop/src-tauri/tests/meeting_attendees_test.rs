use rusqlite::Connection;
use tauri_app_lib::store;

fn setup_test_db(db_path: &std::path::Path) -> Connection {
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
    store::open_db_by_path(db_path).expect("Should open full-schema test db")
}

fn insert_test_meeting(conn: &Connection, google_event_id: &str) -> store::MeetingRow {
    store::upsert_meeting(
        conn,
        store::UpsertMeetingInput {
            google_event_id,
            case_id: None,
            case_link_source: "none",
            title: "Kickoff",
            description: None,
            location: None,
            start_time: "2026-01-01T10:00:00+00:00",
            end_time: "2026-01-01T11:00:00+00:00",
            status: "confirmed",
        },
    )
    .expect("upsert_meeting should succeed")
}

#[test]
fn meeting_has_no_attendees_by_default() {
    let db_path = std::env::temp_dir().join("meeting_attendees_default_test.db");
    let conn = setup_test_db(&db_path);
    let meeting = insert_test_meeting(&conn, "evt-default");

    assert!(meeting.attendees.is_empty());
}

#[test]
fn replace_meeting_attendees_sets_the_full_list() {
    let db_path = std::env::temp_dir().join("meeting_attendees_replace_test.db");
    let conn = setup_test_db(&db_path);
    let meeting = insert_test_meeting(&conn, "evt-replace");

    store::replace_meeting_attendees(
        &conn,
        meeting.id,
        &[
            store::AttendeeInput { email: "a@example.com", display_name: Some("Alice"), response_status: "accepted" },
            store::AttendeeInput { email: "b@example.com", display_name: None, response_status: "needsAction" },
        ],
    )
    .expect("replace_meeting_attendees should succeed");

    let reloaded = store::get_meeting(&conn, meeting.id).expect("get_meeting should succeed").expect("meeting should exist");
    assert_eq!(reloaded.attendees.len(), 2);
    assert_eq!(reloaded.attendees[0].email, "a@example.com");
    assert_eq!(reloaded.attendees[0].display_name.as_deref(), Some("Alice"));
    assert_eq!(reloaded.attendees[0].response_status, "accepted");
    assert_eq!(reloaded.attendees[1].email, "b@example.com");
    assert_eq!(reloaded.attendees[1].response_status, "needsAction");
}

#[test]
fn replace_meeting_attendees_overwrites_the_previous_set() {
    let db_path = std::env::temp_dir().join("meeting_attendees_overwrite_test.db");
    let conn = setup_test_db(&db_path);
    let meeting = insert_test_meeting(&conn, "evt-overwrite");

    store::replace_meeting_attendees(
        &conn,
        meeting.id,
        &[store::AttendeeInput { email: "old@example.com", display_name: None, response_status: "needsAction" }],
    )
    .expect("first replace should succeed");

    store::replace_meeting_attendees(
        &conn,
        meeting.id,
        &[store::AttendeeInput { email: "new@example.com", display_name: None, response_status: "needsAction" }],
    )
    .expect("second replace should succeed");

    let reloaded = store::get_meeting(&conn, meeting.id).expect("get_meeting should succeed").expect("meeting should exist");
    assert_eq!(reloaded.attendees.len(), 1);
    assert_eq!(reloaded.attendees[0].email, "new@example.com");
}

#[test]
fn deleting_a_meeting_cascades_to_its_attendees() {
    let db_path = std::env::temp_dir().join("meeting_attendees_cascade_test.db");
    let conn = setup_test_db(&db_path);
    let meeting = insert_test_meeting(&conn, "evt-cascade");

    store::replace_meeting_attendees(
        &conn,
        meeting.id,
        &[store::AttendeeInput { email: "a@example.com", display_name: None, response_status: "needsAction" }],
    )
    .expect("replace should succeed");

    store::delete_meeting_row(&conn, meeting.id).expect("delete should succeed");

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM meeting_attendees WHERE meeting_id = ?1", rusqlite::params![meeting.id], |row| row.get(0))
        .expect("count query should succeed");
    assert_eq!(count, 0);
}
