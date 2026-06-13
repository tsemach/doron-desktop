use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;
use chrono::Local;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

// ── Structs ─────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DocumentVersion {
    pub id: i64,
    pub case_id: i64,
    pub active_path: String,
    pub version_path: String,
    pub version_name: String,
    pub size_kb: i64,
    pub created_at: String,
    pub notes: Option<String>,
    pub md5_hash: String,
}

#[derive(Clone, Debug)]
struct FileState {
    mtime: SystemTime,
    size: u64,
    is_locked: bool,
    last_change_detected: SystemTime,
}

// Global active watcher cancellation channel
static ACTIVE_WATCHER_TX: OnceLock<Mutex<Option<tokio::sync::oneshot::Sender<()>>>> = OnceLock::new();

// ── DB Schema Init ──────────────────────────────────────────────────────────

pub fn init_version_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS document_versions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id       INTEGER NOT NULL,
            active_path   TEXT NOT NULL,
            version_path  TEXT NOT NULL,
            version_name  TEXT NOT NULL,
            size_kb       INTEGER NOT NULL,
            created_at    TEXT NOT NULL,
            notes         TEXT,
            md5_hash      TEXT NOT NULL,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_doc_versions_active_path ON document_versions(active_path);
    ").map_err(|e| format!("[versions schema] {e}"))?;
    Ok(())
}

// ── Core Hashing & Backup Helpers ───────────────────────────────────────────

pub fn calculate_md5(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|e| format!("Failed to open file for MD5 calculation: {e}"))?;
    let mut context = md5::Context::new();
    std::io::copy(&mut file, &mut context)
        .map_err(|e| format!("Failed to read file bytes for MD5 calculation: {e}"))?;
    let digest = context.compute();
    Ok(format!("{:x}", digest))
}

pub fn create_document_backup_if_exists(
    app: &AppHandle,
    dest_path: &Path,
    note: Option<String>,
    bypass_cooldown: bool,
    bypass_md5: bool,
) -> Result<(), String> {
    if !dest_path.exists() {
        return Ok(());
    }

    let active_path_str = dest_path.to_string_lossy().to_string().replace('\\', "/");
    let conn = crate::store::open_db(app)?;

    // Calculate MD5 of current active file
    let current_md5 = calculate_md5(dest_path)?;

    // If not bypassing both checks, check the last version
    if !bypass_md5 || !bypass_cooldown {
        let active_path_lower = active_path_str.to_lowercase();
        let last_version: Option<(String, String)> = conn.query_row(
            "SELECT created_at, md5_hash FROM document_versions 
             WHERE LOWER(active_path) = ?1 OR LOWER(REPLACE(active_path, '\\', '/')) = ?1 
             ORDER BY id DESC LIMIT 1",
            params![active_path_lower],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).ok();

        if let Some((created_at_str, last_md5)) = last_version {
            // 1. Skip if file contents have not changed (and not bypassing md5 check)
            if !bypass_md5 && last_md5 == current_md5 {
                return Ok(());
            }

            // 2. Skip if it is within the 3-hour cooldown window (and not bypassing cooldown)
            if !bypass_cooldown {
                if let Ok(last_time) = chrono::DateTime::parse_from_rfc3339(&created_at_str) {
                    let diff = chrono::Utc::now().signed_duration_since(last_time.with_timezone(&chrono::Utc));
                    if diff.num_seconds() < 10800 { // 3 hours cooldown
                        return Ok(());
                    }
                }
            }
        }
    }

    // Resolve case_id by matching parent folder
    let parent_dir = dest_path.parent()
        .ok_or_else(|| "Invalid destination path".to_string())?
        .to_string_lossy()
        .to_string();
    let normalized_parent = parent_dir.replace('\\', "/");
    
    let case_id: i64 = conn.query_row(
        "SELECT id FROM cases WHERE REPLACE(folder, '\\', '/') = ?1 OR folder = ?1",
        params![normalized_parent],
        |row| row.get(0)
    ).map_err(|_| format!("Could not find case with folder path: {}", normalized_parent))?;

    // Create .versions directory inside the parent directory
    let versions_dir = dest_path.parent().unwrap().join(".versions");
    if !versions_dir.exists() {
        fs::create_dir_all(&versions_dir)
            .map_err(|e| format!("Failed to create .versions directory: {e}"))?;
    }

    // Construct version name YYYYMMDD_HHMMSS
    let file_name = dest_path.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid filename".to_string())?;
    
    let stem = dest_path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
        
    let ext = dest_path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_name = if ext.is_empty() {
        format!("{}.{}", stem, timestamp)
    } else {
        format!("{}.{}.{}", stem, timestamp, ext)
    };
    
    let backup_path = versions_dir.join(&backup_name);
    let backup_path_str = backup_path.to_string_lossy().to_string().replace('\\', "/");

    // Copy to backup
    fs::copy(dest_path, &backup_path)
        .map_err(|e| format!("Failed to copy file to backup version: {e}"))?;

    let size_kb = fs::metadata(&backup_path)
        .map(|m| m.len() as i64 / 1024)
        .unwrap_or(0);

    let created_at = Local::now().to_rfc3339();

    // Insert database entry
    conn.execute(
        "INSERT INTO document_versions (case_id, active_path, version_path, version_name, size_kb, created_at, notes, md5_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![case_id, active_path_str, backup_path_str, backup_name, size_kb, created_at, note, current_md5],
    ).map_err(|e| format!("Failed to record version record: {e}"))?;

    Ok(())
}

// ── Polling Watcher Logic ───────────────────────────────────────────────────

async fn scan_and_version_case_folder(
    app: &AppHandle,
    _case_id: i64,
    folder_path: &str,
    file_states: &mut HashMap<String, FileState>,
) {
    let path = Path::new(folder_path);
    if !path.exists() {
        return;
    }

    // 1. Scan active files in directory
    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut current_files = HashMap::new();
    let mut lock_files = Vec::new();

    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if name.starts_with('.') {
                continue;
            }
            if name.starts_with("~$") {
                // Word lock file
                lock_files.push(name);
                continue;
            }
            if let Ok(metadata) = fs::metadata(&p) {
                if let Ok(mtime) = metadata.modified() {
                    let path_str = p.to_string_lossy().to_string().replace('\\', "/");
                    current_files.insert(path_str, (p, mtime, metadata.len(), name));
                }
            }
        }
    }

    let mut changed = false;

    // 2. Identify modifications, lock changes and new files
    for (path_str, (file_path, mtime, size, name)) in current_files {
        // Is this file currently locked? (e.g. Word creates a ~$doc.docx lock file)
        let is_locked = lock_files.iter().any(|lock| {
            // Word locks start with ~$ followed by the filename (truncated sometimes, but usually prefix works)
            let suffix = lock.trim_start_matches("~$");
            name.contains(suffix) || suffix.contains(&name)
        });

        if let Some(state) = file_states.get_mut(&path_str) {
            // Check if size or modification time changed
            if state.mtime != mtime || state.size != size || state.is_locked != is_locked {
                let was_locked = state.is_locked;
                state.mtime = mtime;
                state.size = size;
                state.is_locked = is_locked;
                state.last_change_detected = SystemTime::now();

                // If the file is not locked anymore, we trigger the version check
                if !is_locked {
                    // Create backup version (MD5 verify will prevent empty versions)
                    // If it transitioned from locked to unlocked (e.g. Word closed), we bypass the 2-min cooldown
                    if let Err(e) = create_document_backup_if_exists(app, &file_path, None, was_locked, false) {
                        println!("Auto-backup failed for {}: {}", name, e);
                    } else {
                        changed = true;
                    }
                }
            }
        } else {
            // Brand new file detected!
            let new_state = FileState {
                mtime,
                size,
                is_locked,
                last_change_detected: SystemTime::now(),
            };
            file_states.insert(path_str.clone(), new_state);

            // Back up original baseline version immediately
            if !is_locked {
                if let Err(e) = create_document_backup_if_exists(app, &file_path, Some("Original Version".to_string()), true, false) {
                    println!("Original backup failed for {}: {}", name, e);
                } else {
                    changed = true;
                }
            }
        }
    }

    // 3. Clean up deleted file states
    let paths_to_remove: Vec<String> = file_states
        .keys()
        .filter(|k| !Path::new(k).exists())
        .cloned()
        .collect();

    for k in paths_to_remove {
        file_states.remove(&k);
    }

    // 4. Emit change event if a backup was written
    if changed {
        let _ = app.emit("case-files-changed", ());
    }
}

async fn poll_case_folder(
    app: AppHandle,
    case_id: i64,
    folder_path: String,
    mut rx: tokio::sync::oneshot::Receiver<()>,
) {
    let mut file_states: HashMap<String, FileState> = HashMap::new();

    // Populate initial states as baseline
    let path = Path::new(&folder_path);
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.starts_with('.') || name.starts_with("~$") {
                    continue;
                }
                if let Ok(metadata) = fs::metadata(&p) {
                    if let Ok(mtime) = metadata.modified() {
                        let path_str = p.to_string_lossy().to_string().replace('\\', "/");
                        file_states.insert(path_str, FileState {
                            mtime,
                            size: metadata.len(),
                            is_locked: false,
                            last_change_detected: SystemTime::now(),
                        });
                    }
                }
            }
        }
    }

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(3));
    loop {
        tokio::select! {
            _ = &mut rx => {
                break;
            }
            _ = interval.tick() => {
                scan_and_version_case_folder(&app, case_id, &folder_path, &mut file_states).await;
            }
        }
    }
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn start_case_watcher(
    app: AppHandle,
    case_id: i64,
    folder_path: String,
) -> Result<(), String> {
    // 1. Stop active watcher first
    let _ = stop_case_watcher(app.clone());

    // 2. Spawn a new task
    let (tx, rx) = tokio::sync::oneshot::channel();
    let watcher_mutex = ACTIVE_WATCHER_TX.get_or_init(|| Mutex::new(None));
    if let Ok(mut lock) = watcher_mutex.lock() {
        *lock = Some(tx);
    }

    tauri::async_runtime::spawn(async move {
        poll_case_folder(app, case_id, folder_path, rx).await;
    });

    Ok(())
}

#[tauri::command]
pub fn stop_case_watcher(_app: AppHandle) -> Result<(), String> {
    if let Some(lock) = ACTIVE_WATCHER_TX.get() {
        if let Ok(mut guard) = lock.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_document_versions(
    app: AppHandle,
    file_path: String,
) -> Result<Vec<DocumentVersion>, String> {
    let conn = crate::store::open_db(&app)?;
    let normalized = file_path.replace('\\', "/").to_lowercase();
    let mut stmt = conn.prepare(
        "SELECT id, case_id, active_path, version_path, version_name, size_kb, created_at, notes, md5_hash
         FROM document_versions
         WHERE LOWER(active_path) = ?1 OR LOWER(REPLACE(active_path, '\\', '/')) = ?1
         ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![normalized], |row| {
        Ok(DocumentVersion {
            id: row.get(0)?,
            case_id: row.get(1)?,
            active_path: row.get(2)?,
            version_path: row.get(3)?,
            version_name: row.get(4)?,
            size_kb: row.get(5)?,
            created_at: row.get(6)?,
            notes: row.get(7)?,
            md5_hash: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let active_path = Path::new(&file_path);
    let active_md5 = if active_path.exists() {
        calculate_md5(active_path).ok()
    } else {
        None
    };

    let mut versions = Vec::new();
    for r in rows {
        if let Ok(v) = r {
            if Some(&v.md5_hash) != active_md5.as_ref() {
                versions.push(v);
            }
        }
    }
    Ok(versions)
}

#[tauri::command]
pub fn restore_document_version(
    app: AppHandle,
    version_id: i64,
) -> Result<(), String> {
    let conn = crate::store::open_db(&app)?;
    let (active_path_str, version_path_str): (String, String) = conn.query_row(
        "SELECT active_path, version_path FROM document_versions WHERE id = ?1",
        params![version_id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|e| format!("Failed to find version in DB: {e}"))?;

    let active_path = Path::new(&active_path_str);
    let version_path = Path::new(&version_path_str);

    if !version_path.exists() {
        return Err("Version backup file does not exist on disk".to_string());
    }

    // 1. Force back up current state first (so users can revert the restore if they want!)
    if active_path.exists() {
        if let Err(e) = create_document_backup_if_exists(&app, active_path, Some("State before restoring older version".to_string()), true, true) {
            println!("Pre-restore backup failed: {}", e);
        }
    }

    // 2. Restore file contents
    fs::copy(version_path, active_path)
        .map_err(|e| format!("Failed to restore version file contents: {e}"))?;

    // 3. Emit change notification to frontend
    let _ = app.emit("case-files-changed", ());

    Ok(())
}

#[tauri::command]
pub fn delete_document_version(
    app: AppHandle,
    version_id: i64,
) -> Result<(), String> {
    let conn = crate::store::open_db(&app)?;
    let version_path_str: String = conn.query_row(
        "SELECT version_path FROM document_versions WHERE id = ?1",
        params![version_id],
        |row| row.get(0)
    ).map_err(|e| format!("Version record not found: {e}"))?;

    let path = Path::new(&version_path_str);
    if path.exists() {
        let _ = fs::remove_file(path);
    }

    conn.execute(
        "DELETE FROM document_versions WHERE id = ?1",
        params![version_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
