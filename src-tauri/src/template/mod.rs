use std::io::{Read, Write as IoWrite};
use std::path::{Path, PathBuf};
use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::{extractor, llm, store};

const TEMPLATE_FIELD_PROMPT: &str = r#"You are a document template analyzer. Read the document below and return ONLY the original text with every form field, blank, or placeholder replaced by <<field-name>>, where field-name is a short descriptive snake_case label in English.

Look for: underscores (___), bracketed placeholders ([Name], {company}), labels followed by blank space (Date:___), empty table cells that clearly expect input, and any other placeholder pattern.

Return ONLY the marked text, preserving the exact same line structure as the input — same number of lines, same blank lines. Do not add or remove line breaks. No JSON, no explanation, no markdown formatting."#;

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
    let re = Regex::new(r"<<([^>]+)>>").unwrap();
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

fn xml_escape(s: &str) -> String {
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

/// Apply the LLM-marked text to the XML by replacing paragraph runs in-place.
fn mark_document_xml(xml: &str, marked_text: &str) -> String {
    let paras = collect_paragraphs(xml);

    // Non-empty marked lines (preserving order, but skipping blank lines so
    // the LLM's paragraph count matches our non-empty paragraph count).
    let marked_lines: Vec<&str> = marked_text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    // Pair each non-empty original paragraph with a marked line.
    let replacements: Vec<(usize, usize, String)> = paras
        .iter()
        .filter(|(_, _, text)| !text.trim().is_empty())
        .zip(marked_lines.iter())
        .filter_map(|((start, end, _), &line)| {
            let para_xml = &xml[*start..*end];
            if has_drawing(para_xml) {
                None // leave image paragraphs untouched
            } else {
                Some((*start, *end, replace_para_runs(para_xml, line)))
            }
        })
        .collect();

    // Apply in reverse order so earlier byte positions stay valid.
    let mut result = xml.to_string();
    for (start, end, new_para) in replacements.iter().rev() {
        result.replace_range(start..end, new_para);
    }
    result
}

/// Read the original DOCX bytes, update only `word/document.xml` with the
/// marked text, and return the new DOCX bytes.  All other ZIP entries
/// (styles, images, relationships, …) are copied verbatim.
fn apply_marks_to_docx(original_bytes: &[u8], marked_text: &str) -> Result<Vec<u8>, String> {
    let cursor = std::io::Cursor::new(original_bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Cannot open DOCX ZIP: {e}"))?;

    // Read word/document.xml
    let doc_xml = {
        let mut f = archive
            .by_name("word/document.xml")
            .map_err(|_| "word/document.xml not found".to_string())?;
        let mut s = String::new();
        f.read_to_string(&mut s).map_err(|e| e.to_string())?;
        s
    };

    let new_doc_xml = mark_document_xml(&doc_xml, marked_text);

    // Write new ZIP
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
    Ok(out_cursor.into_inner())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn process_template(
    app: AppHandle,
    file_path: String,
    api_key: String,
    model: Option<String>,
) -> Result<TemplateResult, String> {
    let model = model.unwrap_or_else(|| "claude-opus-4-5".to_string());

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

    emit_progress(&app, "processing", "extracting text...");
    let extracted = extractor::extract(path)?;
    let text = extracted.text;

    emit_progress(&app, "processing", "calling AI...");
    let marked_text = llm::call_claude_raw(&text, &api_key, &model, TEMPLATE_FIELD_PROMPT).await?;

    emit_progress(&app, "processing", "saving files...");
    let dir = templates_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Copy original
    let original_dest = dir.join(&file_name);
    std::fs::copy(path, &original_dest).map_err(|e| e.to_string())?;

    // Save marked version
    let marked_path = match ext.as_str() {
        "docx" => {
            let original_bytes = std::fs::read(path).map_err(|e| e.to_string())?;
            let marked_bytes = apply_marks_to_docx(&original_bytes, &marked_text)?;
            let p = dir.join(format!("{stem}.marked.docx"));
            std::fs::write(&p, &marked_bytes).map_err(|e| e.to_string())?;
            p
        }
        _ => {
            // For PDF / XLSX / XLS / TXT: save marked text as .txt
            let p = dir.join(format!("{stem}.marked.txt"));
            std::fs::write(&p, &marked_text).map_err(|e| e.to_string())?;
            p
        }
    };

    let marked_path_str = marked_path.to_string_lossy().to_string();
    let original_path_str = original_dest.to_string_lossy().to_string();

    let fields = extract_field_names(&marked_text);
    let fields_json = serde_json::to_string(&fields).unwrap_or_else(|_| "[]".to_string());

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
    };

    let conn = store::open_db(&app)?;
    let id = store::insert_template(&conn, &record).map_err(|e| e.to_string())?;

    emit_progress(&app, "ok", "done");

    Ok(TemplateResult {
        id,
        marked_path: marked_path_str,
        fields_found: fields,
    })
}

#[tauri::command]
pub fn list_templates(app: AppHandle) -> Result<Vec<store::TemplateRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_templates(&conn).map_err(|e| e.to_string())
}
