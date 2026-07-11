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

    #[link(name = "user32")]
    extern "system" {
        fn mouse_event(dwFlags: u32, dx: i32, dy: i32, dwData: u32, dwExtraInfo: usize);
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

            // Spawn a background thread to simulate subtle user activity (mouse movement)
            // every 30 seconds to bypass Modern Standby sleep transitions (especially on battery).
            std::thread::spawn(move || {
                while PREVENT_SLEEP_COUNT.load(Ordering::SeqCst) > 0 {
                    unsafe {
                        // MOUSEEVENTF_MOVE = 0x0001
                        // Move mouse 1 pixel and back to reset idle timers without impacting user
                        mouse_event(0x0001, 1, 1, 0, 0);
                        mouse_event(0x0001, -1, -1, 0, 0);
                    }
                    std::thread::sleep(std::time::Duration::from_secs(30));
                }
            });
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
    use std::sync::{Mutex, OnceLock};
    use std::process::Child;

    static NON_WIN_GUARD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

    fn get_non_win_guard() -> &'static Mutex<Option<Child>> {
        NON_WIN_GUARD.get_or_init(|| Mutex::new(None))
    }

    pub fn prevent_system_sleep(keep_display_on: bool) {
        #[cfg(target_os = "macos")]
        {
            if let Ok(mut guard) = get_non_win_guard().lock() {
                if guard.is_none() {
                    let arg = if keep_display_on { "-d" } else { "-i" };
                    match std::process::Command::new("caffeinate")
                        .arg(arg)
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .spawn()
                    {
                        Ok(child) => {
                            println!("[Power] Spawned caffeinate helper on macOS (keep_display_on: {}).", keep_display_on);
                            *guard = Some(child);
                        }
                        Err(e) => {
                            println!("[Power] Failed to spawn caffeinate on macOS: {}", e);
                        }
                    }
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            // Detect if we are in WSL
            let is_wsl = std::env::var("WSL_DISTRO_NAME").is_ok() || 
                std::fs::read_to_string("/proc/sys/kernel/osrelease")
                    .map(|s| s.to_lowercase().contains("microsoft"))
                    .unwrap_or(false);

            if is_wsl {
                if let Ok(mut guard) = get_non_win_guard().lock() {
                    if guard.is_none() {
                        let flags = if keep_display_on { "2147483651" } else { "2147483649" };
                        let script = format!(
                            "Add-Type -AssemblyName System.Windows.Forms; \
                             $code = '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint esFlags);'; \
                             Add-Type -MemberDefinition $code -Name Win32SetThreadExecutionState -Namespace Win32; \
                             $myshell = New-Object -com 'Wscript.Shell'; \
                             while ($true) {{ \
                                 [Win32.Win32SetThreadExecutionState]::SetThreadExecutionState({}); \
                                 try {{ \
                                     $pos = [System.Windows.Forms.Cursor]::Position; \
                                     [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($pos.X + 1), $pos.Y); \
                                     [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($pos.X, $pos.Y); \
                                 }} catch {{}} \
                                 try {{ \
                                     $myshell.sendkeys('{{F15}}'); \
                                 }} catch {{}} \
                                 Start-Sleep -Seconds 30; \
                             }}",
                            flags
                        );
                        
                        match std::process::Command::new("powershell.exe")
                            .args(&["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
                            .stdout(std::process::Stdio::null())
                            .stderr(std::process::Stdio::null())
                            .spawn()
                        {
                            Ok(child) => {
                                println!("[Power] Spawned powershell.exe sleep prevention helper in WSL.");
                                *guard = Some(child);
                            }
                            Err(e) => {
                                println!("[Power] Failed to spawn powershell.exe sleep prevention in WSL: {}", e);
                            }
                        }
                    }
                }
            }
        }
    }

    pub fn allow_system_sleep() {
        if let Ok(mut guard) = get_non_win_guard().lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                #[cfg(target_os = "macos")]
                println!("[Power] Terminated caffeinate helper on macOS.");
                #[cfg(target_os = "linux")]
                println!("[Power] Terminated powershell.exe sleep prevention helper in WSL.");
            }
        }
    }
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

