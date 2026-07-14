pub mod docx;
pub mod pdf;
pub mod xlsx;
pub mod txt;
pub mod metadata;

use std::path::Path;

pub struct ExtractedFile {
    pub text: String,
    pub page_count: Option<i32>,
}

pub fn extract(path: &Path) -> Result<ExtractedFile, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "docx" => {
            let text = docx::extract_docx(path)?;
            Ok(ExtractedFile { text, page_count: None })
        }
        "pdf" => {
            let (text, count) = pdf::extract_pdf(path)?;
            Ok(ExtractedFile { text, page_count: Some(count) })
        }
        "xlsx" | "xls" => {
            let text = xlsx::extract_xlsx(path)?;
            Ok(ExtractedFile { text, page_count: None })
        }
        "txt" => Ok(ExtractedFile { text: txt::extract_txt(path)?, page_count: None }),
        _ => Err(format!("Unsupported file type: .{ext}")),
    }
}
