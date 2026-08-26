/// Runs a synchronous, potentially blocking closure on Tauri's dedicated
/// blocking thread pool instead of the shared async worker pool, then
/// returns its result to the calling `async fn`.
///
/// Use this for any SQLite, filesystem, ZIP, or CPU-bound work (text
/// extraction, embedding inference) invoked from an `async fn` Tauri
/// command. Without it, that work runs directly on one of the runtime's
/// few async worker threads with no yield points, stalling every other
/// in-flight command -- search, background pollers, unrelated IPC calls --
/// for the whole duration of the call.
pub async fn run_blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("background task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn run_blocking_returns_ok_value() {
        let result = run_blocking(|| Ok::<i32, String>(42)).await;
        assert_eq!(result, Ok(42));
    }

    #[tokio::test]
    async fn run_blocking_propagates_err() {
        let result = run_blocking(|| Err::<i32, String>("boom".to_string())).await;
        assert_eq!(result, Err("boom".to_string()));
    }

    #[tokio::test]
    async fn run_blocking_reports_panics_as_err_instead_of_crashing() {
        let result = run_blocking(|| -> Result<i32, String> { panic!("kaboom") }).await;
        assert!(result.is_err(), "a panicking closure must surface as Err, not propagate the panic");
    }
}
