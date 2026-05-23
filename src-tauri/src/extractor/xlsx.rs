use calamine::{open_workbook_auto, Reader};
use std::path::Path;

pub fn extract_xlsx(path: &Path) -> Result<String, String> {
    let mut workbook = open_workbook_auto(path).map_err(|e| e.to_string())?;
    let mut parts: Vec<String> = Vec::new();

    let sheet_names = workbook.sheet_names().to_vec();
    for sheet_name in sheet_names {
        parts.push(format!("[Sheet: {sheet_name}]"));
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            let mut rows_seen = 0;
            for row in range.rows() {
                let cells: Vec<String> = row
                    .iter()
                    .map(|c| c.to_string())
                    .filter(|s| !s.trim().is_empty())
                    .collect();
                if !cells.is_empty() {
                    parts.push(cells.join(" | "));
                    rows_seen += 1;
                }
                if rows_seen >= 200 {
                    parts.push("... (truncated)".to_string());
                    break;
                }
            }
        }
    }

    Ok(parts.join("\n"))
}
