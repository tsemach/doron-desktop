# PR 2: Core Business Logic Decoupling & Independent Index Tracks

This phase decouples the document scanning, indexing, and search scoring logic from Tauri's window lifecycle and GUI environment. It also splits indexing into two separate, independent tracks (LLM metadata extraction and local E5 vector embedding) so they can be benchmarked and evaluated separately.

---

## 1. Split Indexing Tracks

Currently, document indexing is a single monolithic loop. We will split this into two independent execution paths inside `indexer/mod.rs` and `index_file_core`:

1. **LLM Metadata Index Track:**
   - Performs text extraction.
   - Invokes the configured `LlmProvider` to extract structured JSON metadata (doc_type, title, date, keywords, etc.).
   - Inserts or updates the `documents` table and updates the FTS5 virtual index.
2. **Vector Embedding Track:**
   - Chunks the extracted document text.
   - Invokes local `fastembed` model to generate vectors.
   - Inserts or updates the `document_chunks` table.

### Independent Benchmark Control
The core function will take configuration flags to enable/disable either track:
```rust
pub struct IndexOptions {
    pub run_llm_metadata: bool,
    pub run_vector_embeddings: bool,
}

pub async fn index_file_core(
    conn: &rusqlite::Connection,
    provider: &crate::llm::llm_provider::LlmProvider,
    file_path: &std::path::Path,
    options: &IndexOptions,
    reindex: bool,
) -> Result<String, String>
```
This allows the evaluation runner to test the vector indexing speed and search accuracy independently from the LLM metadata indexing track.

---

## 2. Decouple Search Logic

Similarly, searching will be decoupled into a core module `query/mod.rs`:
```rust
pub async fn search_documents_core(
    conn: &rusqlite::Connection,
    provider: &crate::llm::llm_provider::LlmProvider,
    query: &str,
    limit: usize,
    use_rerank: bool,
) -> Result<Vec<DocumentRow>, String>
```
The Tauri `search_documents` handler will act as a thin wrapper that opens the database connection, resolves the provider config from the app state/settings, and calls `search_documents_core`.

---

## 3. Testability & Verification

### Offline Integration Tests
To verify the decoupled code, we will write `tests/decoupled_pipeline_test.rs`. 
* **Note on API calls:** This test is an offline integration test. It uses the `MockProvider` and the local embedding generator. It does **not** make any real network requests to online LLMs, nor does it require a local LLM server to be running.
* **Coverage:** It will verify that:
  - We can index a file running only the Vector Embedding track.
  - We can index a file running only the LLM Metadata track.
  - Search correctly queries and resolves results using the selected algorithm (FTS, Vector, or Hybrid).

### Verification Command
Run the test in WSL:
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test decoupled_pipeline_test"
```
