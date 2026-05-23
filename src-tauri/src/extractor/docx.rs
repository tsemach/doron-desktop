use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::Read;
use std::path::Path;

pub fn extract_docx(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive: zip::ZipArchive<std::fs::File> = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut xml_content: String = String::new();
    {
        let mut doc_xml: zip::read::ZipFile<'_> = archive
            .by_name("word/document.xml")
            .map_err(|_| "word/document.xml not found in archive".to_string())?;
        doc_xml
            .read_to_string(&mut xml_content)
            .map_err(|e| e.to_string())?;
    }

    let mut reader = Reader::from_str(&xml_content);
    reader.config_mut().trim_text(true);

    let mut paragraphs: Vec<String> = Vec::new();
    let mut current_para: Vec<String> = Vec::new();
    let mut in_w_t = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => match e.name().as_ref() {
                b"w:p" => current_para.clear(),
                b"w:t" => in_w_t = true,
                _ => {}
            },
            Ok(Event::Text(ref e)) if in_w_t => {
                if let Ok(text) = e.unescape() {
                    current_para.push(text.into_owned());
                }
            }
            Ok(Event::End(ref e)) => match e.name().as_ref() {
                b"w:t" => in_w_t = false,
                b"w:p" => {
                    let line = current_para.join("").trim().to_string();
                    if !line.is_empty() {
                        paragraphs.push(line);
                    }
                    current_para.clear();
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(e.to_string()),
            _ => {}
        }
        buf.clear();
    }

    Ok(paragraphs.join("\n"))
}
