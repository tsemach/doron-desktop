---
name: eval
description: >-
  Guides the agent in executing, configuring, and analyzing search evaluations using the `eval` CLI tool (corpus generation, indexing, metric evaluation, history inspection, and run comparisons).
---

# Evaluation CLI Pipeline

## Overview
This skill provides a standard operating procedure for using the evaluation CLI tool (`eval`) to index, search, and benchmark retrieval algorithms (FTS, Vector, Hybrid, and Reranking) against ground-truth datasets.

## Environment Context Setup
> [!IMPORTANT]
> **WSL Shell Execution & File Locking:**
> * **Use Interactive Shells:** Version managers (like `nvm` or `pnpm`) and CLI paths are loaded inside interactive shells. Always run commands using `zsh -i -c` or `bash -i -c` inside WSL:
>   ```bash
>   wsl --cd ~ zsh -i -c "cd projects/doron-desktop && <command>"
>   ```
> * **Disable Incremental Compilation:** If building/running Cargo commands on shared folders (e.g., WSL network mounts), file locking can fail. Always set `CARGO_INCREMENTAL=0`:
>   ```bash
>   $env:CARGO_INCREMENTAL=0; cargo run ...
>   ```

---

## 1. Corpus Generation (`document generate`)
Generates synthetic documents (mock or AI-generated) in a target directory to build the search corpus, and generates 3 custom Hebrew search queries for each document inside a local `evaluation_dataset.json` file.

* **Offline Mock Generation (Fast & Offline):**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document generate --corpus-dir ./my_test_docs
  ```
* **AI Generation via Local Model (Phi-4/Qwen/Gemma):**
  Requires local model sidecar (`llama-server`) active on port 10086:
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document generate --ai --provider local --model "Phi-4-mini-instruct (3.8B Q4)" --corpus-dir ./phi4_docs
  ```
* **AI Generation via Claude (Online):**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document generate --ai --provider claude --model claude-3-5-sonnet-20241022 --api-key YOUR_API_KEY --corpus-dir ./ai_docs
  ```

---

## 2. Running Benchmark Evaluations (`document run`)
Indexes the generated corpus, autodetects `evaluation_dataset.json` in the corpus directory, runs queries, measures latencies, and computes Precision@1, Recall@3, and Mean Reciprocal Rank (MRR).

### 2.1 Basic Retrieval Algorithms
* **Run Full-Text Search (FTS) Evaluation:**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider mock --algorithm fts --corpus-dir ./my_test_docs
  ```
* **Run Vector Retrieval Evaluation:**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider mock --algorithm vector --corpus-dir ./my_test_docs
  ```
* **Run Hybrid Search (FTS + Vector Fusion):**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider mock --algorithm hybrid --corpus-dir ./my_test_docs
  ```

### 2.2 Hybrid Retrieval with LLM Reranking (`hybrid-rerank`)
* **Mock Provider (Offline Reranking benchmark):**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider mock --algorithm hybrid-rerank --corpus-dir ./my_test_docs
  ```
* **Local Phi-4 Model (Hybrid + Reranking):**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider local --model "Phi-4-mini-instruct (3.8B Q4)" --algorithm hybrid-rerank --corpus-dir ./my_test_docs
  ```
* **Online Gemini Model (Hybrid + Reranking):**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider gemini --model gemini-1.5-pro --api-key YOUR_API_KEY --algorithm hybrid-rerank --corpus-dir ./my_test_docs
  ```

### 2.3 Local LLM Configurations (Requires local llama-server on port 10086)
* **Local Microsoft Phi-4:**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider local --model "Phi-4-mini-instruct (3.8B Q4)" --algorithm hybrid-rerank --corpus-dir ./my_test_docs
  ```
* **Local Alibaba Qwen-2.5 (3B):**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider local --model "Qwen-2.5-3B-Instruct (Q4)" --algorithm hybrid-rerank --corpus-dir ./my_test_docs
  ```
* **Local Google Gemma 2 (2B E4B):**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider local --model "Gemma 4 E4B (Q4)" --algorithm hybrid-rerank --corpus-dir ./my_test_docs
  ```

### 2.4 Online LLM Configurations (Requires API key)
* **Google Gemini 2.0 Flash:**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider gemini --model gemini-2.0-flash --api-key YOUR_API_KEY --algorithm hybrid-rerank --corpus-dir ./my_test_docs
  ```
* **Anthropic Claude 3.5 Sonnet:**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider claude --model claude-3-5-sonnet-online --api-key YOUR_API_KEY --algorithm hybrid-rerank --corpus-dir ./my_test_docs
  ```
* **OpenAI GPT-4o Mini:**
  ```bash
  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider openai --model gpt-4o-mini --api-key YOUR_API_KEY --algorithm hybrid-rerank --corpus-dir ./my_test_docs
  ```



---

## 3. History & Query Inspection (`document list` / `document show` / `document compare`)

### List Evaluation Runs History
Display summary metrics (P@1, R@3, MRR, indexing/search speed) for all completed runs:
```bash
cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document list
```

### Show Specific Run Details
Query-by-query breakdown of rank matches, latencies, and success/fail status for a specific run (e.g. Run `#4`):
```bash
cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document show 4
```

### Compare Runs
Compare retrieval performance and speed changes side-by-side between two runs (e.g. Base `#1` vs Target `#2`):
```bash
cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document compare 1 2
```

---

## Database Architectures
The evaluation tool operates with two SQLite database files:

1. **`evaluation_history.db` (History Database):**
   * **Purpose:** Stores run metadata, computed metrics, and individual query results.
   * **Target Tables:** `evaluation_runs`, `evaluation_queries`.
   * **Location (Linux)**: `~/.local/share/com.tsemach.doron-desktop/evaluation_history.db`
2. **`evaluation_index.db` (Index Database):**
   * **Purpose:** Stores temporary document search index schemas, FTS tables, and vector embeddings generated during the run.
   * **Location (Linux)**: `~/.local/share/com.tsemach.doron-desktop/evaluation_index.db`

---

## Common Mistake Troubleshooting
* **Pointing `show` or `list` to `evaluation_index.db`:**
  If you attempt to load run details pointing `--db-name` to `evaluation_index.db`, it will fail with `Error: Evaluation run #X not found.` because `evaluation_index.db` does not store evaluation history. Always point to `evaluation_history.db`.
* **Argument Separators (`--`):**
  You can execute CLI subcommands directly without specifying double dashes:
  * **Correct**: `cargo run --bin eval document show 1`
  * **Unnecessary**: `cargo run --bin eval -- document show 1`
* **Local Model Warmup Latency:**
  Starting local models on CPU can take 20–40 seconds for memory mapping and model warmup. Let the background process finish warming up before attempting connections.
