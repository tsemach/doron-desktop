use std::path::Path;

/// pdf_extract outputs Hebrew RTL text in visual order (characters reversed).
/// For any line that is predominantly Hebrew, reverse it back to logical order.
fn fix_rtl(text: &str) -> String {
    text.lines()
        .map(|line| {
            let non_space: usize = line.chars().filter(|c| !c.is_whitespace()).count();
            if non_space == 0 {
                return line.to_string();
            }
            let hebrew: usize = line.chars().filter(|&c| {
                matches!(c as u32, 0x0590..=0x05FF | 0xFB1D..=0xFBFF)
            }).count();
            // >20% Hebrew chars → treat whole line as RTL, reverse char-by-char
            if hebrew * 5 > non_space {
                line.chars().rev().collect()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn extract_pdf(path: &Path) -> Result<(String, i32), String> {
    let raw = pdf_extract::extract_text(path).map_err(|e| e.to_string())?;
    let text = fix_rtl(&raw);
    
    let page_count = match lopdf::Document::load(path) {
        Ok(doc) => doc.get_pages().len() as i32,
        Err(err) => {
            eprintln!(
                "Warning: lopdf failed to load document metadata for {:?}: {}. Falling back to page count 1.",
                path, err
            );
            1
        }
    };
    
    Ok((text, page_count))
}
