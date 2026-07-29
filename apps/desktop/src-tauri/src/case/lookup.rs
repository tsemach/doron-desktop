use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::query::TagFilter;
use crate::store;
use crate::tags::list_all_tags_for_scope_type;

use super::Case;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CaseLinkSummary {
    pub id: i64,
    pub subject: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CasePathResolution {
    pub path: String,
    pub case_link: Option<CaseLinkSummary>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CaseSearchRow {
    pub id: i64,
    pub subject: Option<String>,
    pub status: String,
    pub folder: Option<String>,
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn parent_dir_normalized(file_path: &str) -> Option<String> {
    let normalized = normalize_path(file_path);
    let (parent, _) = normalized.rsplit_once('/')?;
    if parent.is_empty() {
        return None;
    }
    Some(parent.to_string())
}

fn status_priority(status: &str) -> i32 {
    match status {
        "open" => 0,
        "waiting" => 1,
        "followup" => 2,
        "closed" => 3,
        _ => 4,
    }
}

fn load_active_cases(app: &AppHandle) -> Result<Vec<Case>, String> {
    let conn = store::open_db(app)?;
    let mut stmt = conn
        .prepare(
            "
            SELECT c.id, c.subject, c.status, c.name, c.created_at, c.updated_at, c.folder, ca.notes
            FROM cases c
            LEFT JOIN case_annotations ca ON c.id = ca.case_id
            WHERE c.deleted = 0 OR c.deleted IS NULL
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Case {
                id: row.get(0)?,
                subject: row.get(1)?,
                status: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                folder: row.get(6)?,
                notes: row.get(7)?,
                tags: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row.map_err(|e| e.to_string())?);
    }

    let all_case_tags = list_all_tags_for_scope_type(app, "case")?;
    for case in list.iter_mut() {
        let case_id_str = case.id.to_string();
        case.tags = all_case_tags
            .iter()
            .filter(|t| t.scope_value.as_deref() == Some(case_id_str.as_str()))
            .cloned()
            .collect();
    }

    Ok(list)
}

fn resolve_case_for_parent<'a>(
    parent: &str,
    cases: &'a [Case],
) -> Option<&'a Case> {
    let mut matches = cases.iter().filter(|c| {
        c.folder
            .as_deref()
            .map(normalize_path)
            .is_some_and(|folder| folder == parent)
    });

    let first = matches.next()?;
    if matches.next().is_some() {
        return None;
    }
    Some(first)
}

#[tauri::command]
pub fn resolve_cases_for_paths(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<CasePathResolution>, String> {
    let cases = load_active_cases(&app)?;

    let mut out = Vec::with_capacity(paths.len());
    for path in paths {
        let case_link = parent_dir_normalized(&path)
            .and_then(|parent| resolve_case_for_parent(&parent, &cases))
            .map(|c| CaseLinkSummary {
                id: c.id,
                subject: c.subject.clone(),
            });

        out.push(CasePathResolution { path, case_link });
    }

    Ok(out)
}

fn case_matches_filters(case: &Case, tags: Option<&[TagFilter]>, notes_contains: Option<&str>) -> bool {
    if let Some(filters) = tags {
        for filter in filters {
            let name = filter.name.trim().to_lowercase();
            if name.is_empty() {
                continue;
            }
            let value = filter.value.as_deref().map(str::trim).filter(|v| !v.is_empty());
            let tag_match = case.tags.iter().any(|tag| {
                tag.name.eq_ignore_ascii_case(&name)
                    && value.map_or(true, |v| tag.value.as_deref() == Some(v))
            });
            if !tag_match {
                return false;
            }
        }
    }

    if let Some(needle) = notes_contains.map(str::trim).filter(|n| !n.is_empty()) {
        let haystack = case.notes.as_deref().unwrap_or("").to_lowercase();
        if !haystack.contains(&needle.to_lowercase()) {
            return false;
        }
    }

    true
}

#[tauri::command]
pub fn search_cases(
    app: AppHandle,
    tags: Option<Vec<TagFilter>>,
    notes_contains: Option<String>,
) -> Result<Vec<CaseSearchRow>, String> {
    let tags_ref = tags.as_deref();
    let notes_ref = notes_contains.as_deref();

    let mut matched: Vec<CaseSearchRow> = load_active_cases(&app)?
        .into_iter()
        .filter(|c| case_matches_filters(c, tags_ref, notes_ref))
        .map(|c| CaseSearchRow {
            id: c.id,
            subject: c.subject,
            status: c.status,
            folder: c.folder,
        })
        .collect();

    matched.sort_by(|a, b| {
        status_priority(&a.status)
            .cmp(&status_priority(&b.status))
            .then_with(|| b.id.cmp(&a.id))
    });

    Ok(matched)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parent_dir_normalized_handles_windows_paths() {
        assert_eq!(
            parent_dir_normalized(r"C:\cases\smith\doc.pdf").as_deref(),
            Some("C:/cases/smith")
        );
    }
}
