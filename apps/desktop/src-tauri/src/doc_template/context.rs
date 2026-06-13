use tauri::AppHandle;
use std::path::Path;
use crate::{extractor, store};

#[tauri::command]
pub fn get_template_field_context(
    app: AppHandle,
    template_id: i64,
    field_name: String,
) -> Result<String, String> {
    let conn = store::open_db(&app)?;

    let mut stmt = conn
        .prepare("SELECT marked_path FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let marked_path_str: String = stmt
        .query_row(rusqlite::params![template_id], |row| row.get(0))
        .map_err(|e| format!("Failed to find template with ID {template_id}: {e}"))?;

    let marked_path = Path::new(&marked_path_str);
    if !marked_path.exists() {
        return Err(format!("Marked template file not found at {marked_path_str}"));
    }

    let extracted = extractor::extract(marked_path)?;
    let text = extracted.text;

    let search_tag = format!("[[{}]]", field_name);
    let lines: Vec<&str> = text.lines().collect();

    for (i, &line) in lines.iter().enumerate() {
        if line.contains(&search_tag) {
            // Found the line containing our field!
            // Build a 5-line context window (2 above, matching line, 2 below)
            let start_line = if i >= 2 { i - 2 } else { 0 };
            let end_line = std::cmp::min(lines.len(), i + 3); // i + 2 inclusive is i + 3 exclusive

            let mut snippet_lines = Vec::new();
            for idx in start_line..end_line {
                let current_line = lines[idx];
                if idx == i {
                    // Match line: truncate it around the placeholder to 22 characters left/right
                    let char_vec: Vec<char> = current_line.chars().collect();
                    let tag_chars: Vec<char> = search_tag.chars().collect();

                    if let Some(pos) = char_vec.windows(tag_chars.len()).position(|w| w == tag_chars) {
                        let left_bound = if pos > 22 { pos - 22 } else { 0 };
                        let right_bound = std::cmp::min(char_vec.len(), pos + tag_chars.len() + 22);

                        let mut part: String = char_vec[left_bound..right_bound].iter().collect();
                        if left_bound > 0 {
                            part = format!("...{}", part);
                        }
                        if right_bound < char_vec.len() {
                            part = format!("{}...", part);
                        }
                        snippet_lines.push(part);
                    } else {
                        snippet_lines.push(current_line.to_string());
                    }
                } else {
                    // Context lines: display the whole line or a trimmed version
                    snippet_lines.push(current_line.trim().to_string());
                }
            }

            return Ok(snippet_lines.join("\n"));
        }
    }

    Err(format!("Field [[{}]] not found in the template text.", field_name))
}
