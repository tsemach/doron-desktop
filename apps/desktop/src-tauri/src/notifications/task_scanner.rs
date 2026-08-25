use std::collections::HashSet;
use tauri::AppHandle;

use crate::store::{self, TaskRow};
use super::{create, NewNotification};

pub const TASK_SCAN_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

/// A task enters the notification window once its due_date's calendar day
/// has arrived or passed. due_date is a plain "YYYY-MM-DD" string (set via
/// a native <input type="date">, no time component -- see MeetingForm.tsx/
/// TaskForm.tsx), so lexicographic string comparison against today's date
/// matches chronological order, the same trick calendar/reminder.rs uses
/// for RFC3339 timestamps.
pub fn tasks_entering_window(all_tasks: &[TaskRow], today: &str) -> Vec<TaskRow> {
    all_tasks
        .iter()
        .filter(|t| matches!(&t.due_date, Some(d) if d.as_str() <= today))
        .cloned()
        .collect()
}

/// Independent loop from every other poller (calendar sync, email ingestion)
/// -- a slow/failing call elsewhere must never delay this one, same reasoning
/// calendar/reminder.rs's header comment states for its own independence.
pub async fn scan_due_tasks_background(app: AppHandle) {
    let mut interval = tokio::time::interval(TASK_SCAN_INTERVAL);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut notified: HashSet<i64> = HashSet::new();
    loop {
        interval.tick().await;
        if let Err(e) = scan_and_notify(&app, &mut notified) {
            println!("[Task Scanner Error] {e}");
        }
    }
}

fn scan_and_notify(app: &AppHandle, notified: &mut HashSet<i64>) -> Result<(), String> {
    let conn = store::open_db(app)?;
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let all_tasks = store::list_tasks_with_due_date(&conn).map_err(|e| e.to_string())?;
    let due = tasks_entering_window(&all_tasks, &today);

    // Drop ids that fell out of the window (completed, due date moved, or
    // deleted) so `notified` doesn't grow without bound in a long session --
    // same convention as calendar/reminder.rs::notified.
    notified.retain(|id| due.iter().any(|t| t.id == *id));

    for task in due {
        if notified.insert(task.id) {
            let _ = create(
                app,
                NewNotification {
                    category: "task_due".to_string(),
                    title: format!("Task due: {}", task.title),
                    body: task.description.clone().unwrap_or_default(),
                    click_target: Some(serde_json::json!({
                        "route": format!("/case-management/cases/{}", task.case_id)
                    })),
                },
            );
        }
    }
    Ok(())
}
