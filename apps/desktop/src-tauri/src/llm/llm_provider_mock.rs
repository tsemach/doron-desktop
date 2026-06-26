pub struct MockProvider;

impl MockProvider {
    pub async fn call_simple(&self, prompt: &str, _system: Option<&str>) -> Result<String, String> {
        // If it's a connection health check or system check
        if prompt.contains("Brief system check") || prompt.contains("system check") {
            return Ok("OK".to_string());
        }

        // Default mock response
        Ok("Mock simple response".to_string())
    }

    pub async fn call_structured(&self, prompt: &str, _system: Option<&str>) -> Result<String, String> {
        // 1. If it's query analysis
        if prompt.contains("Analyze the following query") || prompt.contains("intent") {
            // Check query terms to customize keywords
            let mut keywords = vec!["חוזה".to_string(), "שכירות".to_string()];
            let mut doc_types = vec!["contract".to_string()];
            
            if prompt.contains("גירושין") {
                keywords = vec!["הסכם".to_string(), "גירושין".to_string()];
                doc_types = vec!["contract".to_string()];
            } else if prompt.contains("צוואה") {
                keywords = vec!["צוואה".to_string()];
                doc_types = vec!["will".to_string()];
            } else if prompt.contains("רשלנות") {
                keywords = vec!["רשלנות".to_string(), "רפואית".to_string(), "תביעה".to_string()];
                doc_types = vec!["report".to_string()];
            } else if prompt.contains("מכר") || prompt.contains("רחל") {
                keywords = vec!["חוזה".to_string(), "מכר".to_string(), "לוי".to_string()];
                doc_types = vec!["contract".to_string()];
            }

            let response_json = serde_json::json!({
                "keywords": keywords,
                "entities": [],
                "doc_types": doc_types,
                "date_range": {
                    "from": null,
                    "to": null
                },
                "summary_importance": false
            });
            return Ok(response_json.to_string());
        }

        // 2. If it's reranking candidates
        if prompt.contains("Candidates:") || prompt.contains("Rerank") {
            // Find IDs in the candidate JSON inside the prompt
            let mut ids = Vec::new();
            let mut search = prompt;
            while let Some(pos) = search.find("\"id\":") {
                let rest = &search[pos + 5..];
                if let Some(end) = rest.find(|c: char| !c.is_digit(10)) {
                    if let Ok(id) = rest[..end].trim().parse::<i64>() {
                        ids.push(id);
                    }
                }
                search = rest;
            }
            return Ok(serde_json::json!(ids).to_string());
        }

        // 3. If it's document metadata extraction
        if prompt.contains("doc_type") || prompt.contains("document analyst") {
            let doc_type = if prompt.contains("שכירות") {
                "contract"
            } else if prompt.contains("גירושין") {
                "contract"
            } else if prompt.contains("צוואה") {
                "will"
            } else if prompt.contains("רשלנות") {
                "report"
            } else if prompt.contains("מכר") || prompt.contains("רחל") {
                "contract"
            } else {
                "other"
            };

            let title = if prompt.contains("חוזה שכירות") {
                "חוזה שכירות דירה"
            } else if prompt.contains("הסכם גירושין") {
                "הסכם גירושין ופירוד"
            } else if prompt.contains("צוואה") {
                "צוואה בעדים"
            } else if prompt.contains("רשלנות") {
                "כתב תביעה בגין רשלנות רפואית"
            } else if prompt.contains("מכר") || prompt.contains("רחל") {
                "חוזה מכר דירה"
            } else {
                "מסמך משפטי"
            };

            let keywords = if prompt.contains("שכירות") {
                vec!["חוזה".to_string(), "שכירות".to_string(), "דירה".to_string()]
            } else if prompt.contains("גירושין") {
                vec!["הסכם".to_string(), "גירושין".to_string(), "משותף".to_string()]
            } else if prompt.contains("צוואה") {
                vec!["צוואה".to_string(), "ירושה".to_string(), "עיזבון".to_string()]
            } else if prompt.contains("רשלנות") {
                vec!["רשלנות".to_string(), "רפואית".to_string(), "תביעה".to_string()]
            } else if prompt.contains("מכר") || prompt.contains("רחל") {
                vec!["חוזה".to_string(), "מכר".to_string(), "לוי".to_string()]
            } else {
                vec!["חוזה".to_string(), "דירה".to_string(), "מסמך".to_string()]
            };

            let response_json = serde_json::json!({
                "doc_type": doc_type,
                "title": title,
                "summary": "מסמך משפטי שנפתח לצורך בדיקה והערכה של מערכת האינדקס.",
                "authors": ["עו\"ד לוי"],
                "date": "2024-01-01",
                "topics": ["משפטים", "בדיקה"],
                "entities": [],
                "language": "he",
                "keywords": keywords,
                "confidence": 0.95
            });
            return Ok(response_json.to_string());
        }

        // Default empty JSON
        Ok("{}".to_string())
    }
}
