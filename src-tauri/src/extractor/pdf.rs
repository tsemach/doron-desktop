use std::path::Path;

pub fn extract_pdf(path: &Path) -> Result<(String, i32), String> {
    let text = pdf_extract::extract_text(path).map_err(|e| e.to_string())?;
    let doc = lopdf::Document::load(path).map_err(|e| e.to_string())?;
    let page_count = doc.get_pages().len() as i32;
    Ok((text, page_count))
}
