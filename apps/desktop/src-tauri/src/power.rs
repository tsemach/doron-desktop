#[cfg(target_os = "windows")]
mod win_power {
    use std::sync::atomic::{AtomicUsize, Ordering};

    // Track active sleep-prevention requests so multiple concurrent operations don't conflict
    static PREVENT_SLEEP_COUNT: AtomicUsize = AtomicUsize::new(0);

    type EXECUTION_STATE = u32;
    const ES_CONTINUOUS: EXECUTION_STATE = 0x80000000;
    const ES_SYSTEM_REQUIRED: EXECUTION_STATE = 0x00000001;
    const ES_DISPLAY_REQUIRED: EXECUTION_STATE = 0x00000002;

    #[link(name = "kernel32")]
    extern "system" {
        fn SetThreadExecutionState(esFlags: EXECUTION_STATE) -> EXECUTION_STATE;
    }

    pub fn prevent_system_sleep(keep_display_on: bool) {
        let count = PREVENT_SLEEP_COUNT.fetch_add(1, Ordering::SeqCst);
        if count == 0 {
            let mut flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED;
            if keep_display_on {
                flags |= ES_DISPLAY_REQUIRED;
            }
            unsafe {
                SetThreadExecutionState(flags);
            }
            println!("[Power] Sleep prevention enabled (keep_display_on: {}).", keep_display_on);
        }
    }

    pub fn allow_system_sleep() {
        let count = PREVENT_SLEEP_COUNT.load(Ordering::SeqCst);
        if count > 0 {
            let new_count = PREVENT_SLEEP_COUNT.fetch_sub(1, Ordering::SeqCst) - 1;
            if new_count == 0 {
                unsafe {
                    SetThreadExecutionState(ES_CONTINUOUS);
                }
                println!("[Power] Sleep prevention released.");
            }
        }
    }
}

// Fallback for non-Windows platforms (macOS, Linux)
#[cfg(not(target_os = "windows"))]
mod win_power {
    pub fn prevent_system_sleep(_keep_display_on: bool) {}
    pub fn allow_system_sleep() {}
}

pub fn prevent_sleep_core(keep_display_on: bool) {
    win_power::prevent_system_sleep(keep_display_on);
}

pub fn allow_sleep_core() {
    win_power::allow_system_sleep();
}

#[tauri::command]
pub fn prevent_sleep(keep_display_on: bool) {
    prevent_sleep_core(keep_display_on);
}

#[tauri::command]
pub fn allow_sleep() {
    allow_sleep_core();
}

/// RAII Guard that automatically prevents sleep on creation and restores it on drop.
pub struct SleepPreventionGuard;

impl SleepPreventionGuard {
    pub fn new(keep_display_on: bool) -> Self {
        prevent_sleep_core(keep_display_on);
        Self
    }
}

impl Drop for SleepPreventionGuard {
    fn drop(&mut self) {
        allow_sleep_core();
    }
}

