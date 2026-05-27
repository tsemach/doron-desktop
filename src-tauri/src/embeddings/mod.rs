use std::sync::{Arc, Mutex};
use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};

static EMBEDDING_MODEL: Mutex<Option<Arc<TextEmbedding>>> = Mutex::new(None);

/// Dynamically determine cache directory based on OS
pub fn get_cache_dir() -> std::path::PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        // Linux/Ubuntu (WSL)
        std::path::PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("com.tsemach.doron-desktop")
            .join("fastembed_cache")
    } else if let Ok(userprofile) = std::env::var("USERPROFILE") {
        // Windows
        std::path::PathBuf::from(userprofile)
            .join("AppData")
            .join("Local")
            .join("com.tsemach.doron-desktop")
            .join("fastembed_cache")
    } else {
        // Fallback
        std::path::PathBuf::from(".")
            .join("fastembed_cache")
    }
}

/// Retrieve a reference to the global lazy-initialized TextEmbedding model.
pub fn get_embedding_model() -> Result<Arc<TextEmbedding>, String> {
    let mut lock = EMBEDDING_MODEL.lock().map_err(|e| e.to_string())?;
    if let Some(ref model) = *lock {
        return Ok(model.clone());
    }
    
    let cache_dir = get_cache_dir();
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    let model = TextEmbedding::try_new(
        InitOptions::new(EmbeddingModel::MultilingualE5Small)
            .with_show_download_progress(false)
            .with_cache_dir(cache_dir)
    ).map_err(|e| format!("Failed to initialize embedding model: {e}"))?;
    let arc_model = Arc::new(model);
    *lock = Some(arc_model.clone());
    Ok(arc_model)
}

/// Helper to generate embeddings for a list of passages.
/// Prepends "passage: " required by the E5 model family.
pub fn get_passage_embeddings(texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let model = get_embedding_model()?;
    let prefixed: Vec<String> = texts.iter().map(|t| format!("passage: {t}")).collect();
    model.embed(prefixed, None).map_err(|e| format!("Failed to generate embeddings: {e}"))
}

/// Helper to generate the embedding for a single search query.
/// Prepends "query: " required by the E5 model family.
pub fn get_query_embedding(text: &str) -> Result<Vec<f32>, String> {
    let model = get_embedding_model()?;
    let prefixed = format!("query: {text}");
    let embeddings = model.embed(vec![prefixed], None).map_err(|e| format!("Failed to generate query embedding: {e}"))?;
    if embeddings.is_empty() {
        return Err("No query embedding generated".to_string());
    }
    Ok(embeddings[0].clone())
}

/// Splits text into smaller overlapping chunks.
pub fn chunk_text(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    if text.trim().is_empty() {
        return vec![];
    }
    let chars: Vec<char> = text.chars().collect();
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + chunk_size).min(chars.len());
        let chunk: String = chars[start..end].iter().collect();
        chunks.push(chunk);
        if end == chars.len() {
            break;
        }
        if chunk_size > overlap {
            start += chunk_size - overlap;
        } else {
            start += 1;
        }
    }
    chunks
}

/// Convert a slice of f32 to a Vec of raw bytes for SQLite BLOB storage.
pub fn vec_to_bytes(v: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(v.len() * 4);
    for &val in v {
        bytes.extend_from_slice(&val.to_ne_bytes());
    }
    bytes
}

/// Convert raw SQLite BLOB bytes back into a Vec of f32.
pub fn bytes_to_vec(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4)
        .map(|chunk| f32::from_ne_bytes(chunk.try_into().unwrap()))
        .collect()
}

/// Compute cosine similarity between two float vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a * norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}
