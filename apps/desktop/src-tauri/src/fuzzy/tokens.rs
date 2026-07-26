pub fn exact_term(keyword: &str) -> String {
    format!("\"{}\"", keyword.replace('"', "\"\""))
}

/// FTS5 prefix token — matches word stems (e.g. `rent*` matches "rental").
pub fn prefix_term(keyword: &str) -> String {
    let escaped = keyword.replace('"', "\"\"");
    format!("{escaped}*")
}
