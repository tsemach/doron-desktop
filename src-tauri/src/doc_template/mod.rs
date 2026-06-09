use std::io::{Read, Write as IoWrite};
use std::path::{Path, PathBuf};
use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::{extractor, store};

#[derive(Serialize, Clone)]
struct TemplateProgress {
    status: String,
    message: String,
}

#[derive(Serialize)]
pub struct TemplateResult {
    pub id: i64,
    pub marked_path: String,
    pub fields_found: Vec<String>,
}

pub fn templates_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("templates")
}

fn emit_progress(app: &AppHandle, status: &str, message: &str) {
    let _ = app.emit(
        "template-progress",
        TemplateProgress {
            status: status.to_string(),
            message: message.to_string(),
        },
    );
}

fn extract_field_names(marked_text: &str) -> Vec<String> {
    let re = Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    let mut names: Vec<String> = re
        .captures_iter(marked_text)
        .map(|c| c[1].to_string())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    names.sort();
    names
}

// ── DOCX in-place modification ────────────────────────────────────────────────

pub fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Extract concatenated text from all <w:t>…</w:t> elements in a string.
fn extract_wt_text(s: &str) -> String {
    let mut result = String::new();
    let mut search = s;
    while let Some(start) = search.find("<w:t") {
        if start + 4 < search.len() {
            let next_char = search.as_bytes()[start + 4];
            if next_char != b'>' && next_char != b' ' {
                // Skip tags like <w:textInput>, <w:tab>, etc.
                search = &search[start + 4..];
                continue;
            }
        }
        let rest = &search[start..];
        if let Some(bracket_end) = rest.find('>') {
            let content_start = bracket_end + 1;
            if let Some(close) = rest[content_start..].find("</w:t>") {
                let raw = &rest[content_start..content_start + close];
                result.push_str(
                    &raw.replace("&amp;", "&")
                        .replace("&lt;", "<")
                        .replace("&gt;", ">")
                        .replace("&quot;", "\"")
                        .replace("&apos;", "'"),
                );
                search = &rest[content_start + close + "</w:t>".len()..];
            } else {
                break;
            }
        } else {
            break;
        }
    }
    result
}

/// Find the byte offset of the next `<w:p>` or `<w:p ` paragraph open tag,
/// skipping `<w:pPr>`, `<w:pStyle>`, etc.
fn find_para_open(s: &str) -> Option<usize> {
    let b = s.as_bytes();
    let mut i = 0;
    while i + 4 <= b.len() {
        if b[i] == b'<' && b[i + 1] == b'w' && b[i + 2] == b':' && b[i + 3] == b'p' {
            let next = if i + 4 < b.len() { b[i + 4] } else { b'>' };
            if next == b'>' || next == b' ' {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

/// Find the byte offset of the next `<w:r>` or `<w:r ` run open tag,
/// skipping `<w:rPr>`, `<w:rFonts>`, etc.
fn find_run_open(s: &str) -> Option<usize> {
    let b = s.as_bytes();
    let mut i = 0;
    while i + 4 <= b.len() {
        if b[i] == b'<' && b[i + 1] == b'w' && b[i + 2] == b':' && b[i + 3] == b'r' {
            let next = if i + 4 < b.len() { b[i + 4] } else { b'>' };
            if next == b'>' || next == b' ' {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

fn has_drawing(s: &str) -> bool {
    s.contains("<w:drawing") || s.contains("<w:pict")
}

/// Extract the content of a named XML element (first match), including tags.
fn extract_element<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let open_prefix = format!("<{tag}");
    let close_tag = format!("</{tag}>");
    let start = xml.find(&open_prefix)?;
    let rest = &xml[start..];
    if let Some(end) = rest.find(&close_tag) {
        Some(&rest[..end + close_tag.len()])
    } else if let Some(sc) = rest.find("/>") {
        Some(&rest[..sc + 2])
    } else {
        None
    }
}

/// Collect all `(byte_start, byte_end, text)` for every `<w:p>…</w:p>` in the XML.
fn collect_paragraphs(xml: &str) -> Vec<(usize, usize, String)> {
    let mut result = Vec::new();
    let mut pos = 0;
    while pos < xml.len() {
        match find_para_open(&xml[pos..]) {
            Some(rel) => {
                let abs_start = pos + rel;
                match xml[abs_start..].find("</w:p>") {
                    Some(close_rel) => {
                        let abs_end = abs_start + close_rel + "</w:p>".len();
                        let para_xml = &xml[abs_start..abs_end];
                        let text = extract_wt_text(para_xml);
                        result.push((abs_start, abs_end, text));
                        pos = abs_end;
                    }
                    None => break,
                }
            }
            None => break,
        }
    }
    result
}

/// Replace the text runs in a paragraph with a single run carrying `marked_text`.
/// Preserves `<w:pPr>` (paragraph formatting) and the first run's `<w:rPr>`
/// (character formatting such as RTL, font family, size).
fn replace_para_runs(para_xml: &str, marked_text: &str) -> String {
    // Paragraph opening tag (with all its attributes)
    let p_open_end = para_xml.find('>').map(|i| i + 1).unwrap_or(4);
    let p_open = &para_xml[..p_open_end];

    // Paragraph properties
    let ppr = extract_element(para_xml, "w:pPr");

    // First run's character properties (fonts, RTL direction, size, colour …)
    let first_rpr = find_run_open(para_xml)
        .and_then(|r| extract_element(&para_xml[r..], "w:rPr"));

    let escaped = xml_escape(marked_text);

    let mut out = String::new();
    out.push_str(p_open);
    if let Some(ppr) = ppr {
        out.push_str(ppr);
    }
    out.push_str("<w:r>");
    if let Some(rpr) = first_rpr {
        out.push_str(rpr);
    }
    out.push_str(&format!(
        "<w:t xml:space=\"preserve\">{escaped}</w:t></w:r></w:p>"
    ));
    out
}

pub fn replace_docx_placeholders(xml: &str, field_values: &std::collections::HashMap<String, String>) -> String {
    let mut result = xml.to_string();

    // 1. Perform global string replacement for placeholders that are not split
    // (e.g. inside form field attributes like w:default, or single XML text runs)
    for (key, val) in field_values {
        let placeholder = format!("[[{}]]", key);
        let escaped_val = xml_escape(val);
        result = result.replace(&placeholder, &escaped_val);
    }

    // 2. Perform run-based reconstruction for placeholders split across runs
    let paras = collect_paragraphs(&result);
    let mut replacements: Vec<(usize, usize, String)> = Vec::new();

    for (start, end, text) in paras {
        let mut new_text = text.clone();
        let mut changed = false;
        
        for (key, val) in field_values {
            let placeholder = format!("[[{}]]", key);
            if new_text.contains(&placeholder) {
                let escaped_val = xml_escape(val);
                new_text = new_text.replace(&placeholder, &escaped_val);
                changed = true;
            }
        }

        if changed {
            let para_xml = &result[start..end];
            if !has_drawing(para_xml) {
                let replaced = replace_para_runs(para_xml, &new_text);
                replacements.push((start, end, replaced));
            }
        }
    }

    for (start, end, new_para) in replacements.iter().rev() {
        result.replace_range(start..end, new_para);
    }
    
    strip_docx_form_fields(&result)
}

fn strip_docx_form_fields(xml: &str) -> String {
    // 1. Remove bookmark tags
    let mut result = xml.to_string();
    if let Ok(re_start) = Regex::new(r"<w:bookmarkStart[^>]*/>") {
        result = re_start.replace_all(&result, "").to_string();
    }
    if let Ok(re_end) = Regex::new(r"<w:bookmarkEnd[^>]*/>") {
        result = re_end.replace_all(&result, "").to_string();
    }
    if let Ok(re_perm_start) = Regex::new(r"<w:permStart[^>]*/>") {
        result = re_perm_start.replace_all(&result, "").to_string();
    }
    if let Ok(re_perm_end) = Regex::new(r"<w:permEnd[^>]*/>") {
        result = re_perm_end.replace_all(&result, "").to_string();
    }


    // 2. Remove form field runs
    let mut final_xml = String::new();
    let mut last_idx = 0;
    
    while let Some(start_idx) = find_run_open(&result[last_idx..]) {
        let abs_start = last_idx + start_idx;
        final_xml.push_str(&result[last_idx..abs_start]);
        
        if let Some(end_offset) = result[abs_start..].find("</w:r>") {
            let abs_end = abs_start + end_offset + "</w:r>".len();
            let run_xml = &result[abs_start..abs_end];
            
            let should_strip = run_xml.contains("w:fldCharType=\"begin\"")
                || run_xml.contains("<w:instrText")
                || run_xml.contains("w:fldCharType=\"separate\"")
                || run_xml.contains("w:fldCharType=\"end\"");
                
            if !should_strip {
                final_xml.push_str(run_xml);
            }
            last_idx = abs_end;
        } else {
            final_xml.push_str(&result[abs_start..]);
            last_idx = result.len();
            break;
        }
    }
    if last_idx < result.len() {
        final_xml.push_str(&result[last_idx..]);
    }
    
    final_xml
}


// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
#[allow(unused_variables)]
pub async fn process_template(
    app: AppHandle,
    file_path: String,
    api_key: Option<String>,
    model: Option<String>,
    title: Option<String>,
) -> Result<TemplateResult, String> {
    let path = Path::new(&file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let allowed = ["docx", "pdf", "xlsx", "xls", "txt"];
    if !allowed.contains(&ext.as_str()) {
        return Err(format!("Unsupported file type: {ext}"));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("template")
        .to_string();

    emit_progress(&app, "processing", "extracting fields...");
    let extracted = extractor::extract(path)?;
    let text = extracted.text;
    let fields = extract_field_names(&text);
    let fields_json = serde_json::to_string(&fields).unwrap_or_else(|_| "[]".to_string());

    emit_progress(&app, "processing", "copying template file...");
    let dir = templates_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Copy original
    let original_dest = dir.join(&file_name);
    std::fs::copy(path, &original_dest).map_err(|e| e.to_string())?;

    // Copy original directly as marked version (no LLM, manual edit flow)
    let marked_path = dir.join(format!("{stem}.marked.{ext}"));
    std::fs::copy(path, &marked_path).map_err(|e| e.to_string())?;

    let marked_path_str = marked_path.to_string_lossy().to_string();
    let original_path_str = original_dest.to_string_lossy().to_string();

    let file_size_kb = std::fs::metadata(path)
        .map(|m| m.len() as i64 / 1024)
        .unwrap_or(0);

    let uploaded_at = chrono::Utc::now().to_rfc3339();

    let record = store::TemplateRecord {
        file_name,
        original_path: original_path_str,
        marked_path: marked_path_str.clone(),
        file_ext: ext,
        file_size_kb,
        fields_found: fields_json,
        uploaded_at,
        title,
    };

    let conn = store::open_db(&app)?;
    let id = store::insert_template(&conn, &record).map_err(|e| e.to_string())?;

    emit_progress(&app, "processing", "opening template editor...");
    if let Err(e) = open_template_file(marked_path_str.clone()) {
        eprintln!("Failed to open template file: {e}");
    }

    emit_progress(&app, "ok", "done");

    Ok(TemplateResult {
        id,
        marked_path: marked_path_str,
        fields_found: fields,
    })
}

#[tauri::command]
pub fn sync_template_fields(app: AppHandle, template_id: i64) -> Result<Vec<String>, String> {
    let conn = store::open_db(&app)?;
    
    let mut stmt = conn
        .prepare("SELECT marked_path FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let marked_path_str: String = stmt
        .query_row(rusqlite::params![template_id], |row| row.get(0))
        .map_err(|e| format!("Failed to find template with ID {template_id}: {e}"))?;
        
    let marked_path = std::path::Path::new(&marked_path_str);
    if !marked_path.exists() {
        return Err(format!("Marked template file not found at {marked_path_str}"));
    }
    
    let extracted = extractor::extract(marked_path)?;
    let fields = extract_field_names(&extracted.text);
    let fields_json = serde_json::to_string(&fields).unwrap_or_else(|_| "[]".to_string());
    
    conn.execute(
        "UPDATE doc_templates SET fields_found = ?1 WHERE id = ?2",
        rusqlite::params![fields_json, template_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(fields)
}

#[tauri::command]
pub fn sync_all_templates_fields(app: AppHandle) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    
    let mut stmt = conn
        .prepare("SELECT id, marked_path FROM doc_templates")
        .map_err(|e| e.to_string())?;
        
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;
    
    for r in rows {
        if let Ok((id, marked_path_str)) = r {
            let marked_path = std::path::Path::new(&marked_path_str);
            if marked_path.exists() {
                if let Ok(extracted) = extractor::extract(marked_path) {
                    let fields = extract_field_names(&extracted.text);
                    let fields_json = serde_json::to_string(&fields).unwrap_or_else(|_| "[]".to_string());
                    let _ = conn.execute(
                        "UPDATE doc_templates SET fields_found = ?1 WHERE id = ?2",
                        rusqlite::params![fields_json, id],
                    );
                }
            }
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn list_templates(app: AppHandle) -> Result<Vec<store::TemplateRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_templates(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_document_from_template(
    app: AppHandle,
    template_id: i64,
    field_values: std::collections::HashMap<String, String>,
    output_path: String,
) -> Result<String, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT marked_path, file_ext FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let (marked_path_str, file_ext): (String, String) = stmt
        .query_row(rusqlite::params![template_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| format!("Failed to find template with ID {template_id}: {e}"))?;

    let marked_path = std::path::Path::new(&marked_path_str);
    if !marked_path.exists() {
        return Err(format!("Marked template file not found at {marked_path_str}"));
    }

    if file_ext == "docx" {
        let original_bytes = std::fs::read(marked_path)
            .map_err(|e| format!("Failed to read marked template DOCX: {e}"))?;

        let cursor = std::io::Cursor::new(original_bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Cannot open template DOCX: {e}"))?;

        let doc_xml = {
            let mut f = archive
                .by_name("word/document.xml")
                .map_err(|_| "word/document.xml not found".to_string())?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            s
        };

        let mut new_doc_xml = doc_xml;
        new_doc_xml = replace_docx_placeholders(&new_doc_xml, &field_values);

        let out_buf: Vec<u8> = Vec::new();
        let out_cursor = std::io::Cursor::new(out_buf);
        let mut new_zip = zip::ZipWriter::new(out_cursor);

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();
            let opts = zip::write::FileOptions::<()>::default()
                .compression_method(file.compression());

            if file.is_dir() {
                new_zip.add_directory(&name, opts).map_err(|e| e.to_string())?;
            } else {
                new_zip.start_file(&name, opts).map_err(|e| e.to_string())?;
                if name == "word/document.xml" {
                    new_zip
                        .write_all(new_doc_xml.as_bytes())
                        .map_err(|e| e.to_string())?;
                } else {
                    let mut content = Vec::new();
                    file.read_to_end(&mut content).map_err(|e| e.to_string())?;
                    new_zip.write_all(&content).map_err(|e| e.to_string())?;
                }
            }
        }

        let out_cursor = new_zip.finish().map_err(|e| e.to_string())?;
        let output_bytes = out_cursor.into_inner();

        std::fs::write(&output_path, &output_bytes)
            .map_err(|e| format!("Failed to write generated DOCX: {e}"))?;
    } else {
        let mut text = std::fs::read_to_string(marked_path)
            .map_err(|e| format!("Failed to read marked text template: {e}"))?;

        for (key, val) in field_values {
            text = text.replace(&format!("[[{key}]]"), &val);
        }

        std::fs::write(&output_path, text)
            .map_err(|e| format!("Failed to write generated text: {e}"))?;
    }

    let dest_path = std::path::Path::new(&output_path);
    if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, dest_path, Some("Original Version".to_string()), true, true) {
        println!("Failed to create document version backup on generate: {}", e);
    }

    Ok(output_path)
}

#[tauri::command]
pub async fn fill_document_placeholders(
    source_path: String,
    output_path: String,
    field_values: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let path = std::path::Path::new(&source_path);
    if !path.exists() {
        return Err("Source file does not exist".to_string());
    }

    let file_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if file_ext == "docx" {
        let original_bytes = std::fs::read(path)
            .map_err(|e| format!("Failed to read source DOCX: {e}"))?;

        let cursor = std::io::Cursor::new(original_bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Cannot open source DOCX: {e}"))?;

        let doc_xml = {
            let mut f = archive
                .by_name("word/document.xml")
                .map_err(|_| "word/document.xml not found".to_string())?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            s
        };

        let mut new_doc_xml = doc_xml;
        new_doc_xml = replace_docx_placeholders(&new_doc_xml, &field_values);

        let out_buf: Vec<u8> = Vec::new();
        let out_cursor = std::io::Cursor::new(out_buf);
        let mut new_zip = zip::ZipWriter::new(out_cursor);

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();
            let opts = zip::write::FileOptions::<()>::default()
                .compression_method(file.compression());

            if file.is_dir() {
                new_zip.add_directory(&name, opts).map_err(|e| e.to_string())?;
            } else {
                new_zip.start_file(&name, opts).map_err(|e| e.to_string())?;
                if name == "word/document.xml" {
                    new_zip
                        .write_all(new_doc_xml.as_bytes())
                        .map_err(|e| e.to_string())?;
                } else {
                    let mut content = Vec::new();
                    file.read_to_end(&mut content).map_err(|e| e.to_string())?;
                    new_zip.write_all(&content).map_err(|e| e.to_string())?;
                }
            }
        }

        let out_cursor = new_zip.finish().map_err(|e| e.to_string())?;
        let output_bytes = out_cursor.into_inner();

        std::fs::write(&output_path, &output_bytes)
            .map_err(|e| format!("Failed to write generated DOCX: {e}"))?;
    } else {
        let mut text = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read source text file: {e}"))?;

        for (key, val) in field_values {
            text = text.replace(&format!("[[{key}]]"), &val);
        }

        std::fs::write(&output_path, text)
            .map_err(|e| format!("Failed to write generated text: {e}"))?;
    }

    Ok(output_path)
}

#[tauri::command]
pub fn open_template_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let is_wsl = std::path::Path::new("/proc/sys/fs/binfmt_misc/WSLInterop").exists()
            || std::env::var("WSL_DISTRO_NAME").is_ok();

        if is_wsl {
            let status = std::process::Command::new("wslview")
                .arg(&path)
                .status();
            if let Ok(s) = status {
                if s.success() {
                    return Ok(());
                }
            }
        }

        let status = std::process::Command::new("xdg-open")
            .arg(&path)
            .status();
        if let Ok(s) = status {
            if s.success() {
                return Ok(());
            }
        }
        Err("Failed to open template file via wslview or xdg-open".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("cmd")
            .args(&["/C", "start", "", &path])
            .status();
        if let Ok(s) = status {
            if s.success() {
                return Ok(());
            }
        }
        Err("Failed to open template file via cmd.exe".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg(&path)
            .status();
        if let Ok(s) = status {
            if s.success() {
                return Ok(());
            }
        }
        Err("Failed to open template file via open".to_string())
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        Err("Unsupported operating system".to_string())
    }
}

#[tauri::command]
pub fn delete_template(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;

    let mut stmt = conn
        .prepare("SELECT original_path, marked_path FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let (original_path_str, marked_path_str): (String, String) = stmt
        .query_row(rusqlite::params![id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Failed to find template with ID {id}: {e}"))?;

    let orig_path = std::path::Path::new(&original_path_str);
    if orig_path.exists() {
        let _ = std::fs::remove_file(orig_path);
    }
    let marked_path = std::path::Path::new(&marked_path_str);
    if marked_path.exists() {
        let _ = std::fs::remove_file(marked_path);
    }

    conn.execute("DELETE FROM doc_templates WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}
