# Document Scan, Index, and Search Evaluation Pipeline Plan

This directory contains the detailed implementation roadmap for a unified local-first/cloud-agnostic AI provider infrastructure and a repeatable evaluation pipeline.

The plan is split into 5 step-by-step Pull Requests (PRs) to allow structured tracking and verification.

---

## Roadmap Index

1. **[PR 1: Core AI Provider Infrastructure Layer](pr1_provider_infra.md)**
   - Implements the unified `LlmProvider` layer (`ClaudeProvider`, `GeminiProvider`, `OpenAiProvider`, `MockProvider`).
   - Supports local models (e.g. Ollama or sidecars) and Bring Your Own Model (BYOM) custom base URLs.
   - Includes the offline `MockProvider` for zero-cost and zero-latency developer testing.
2. **[PR 2: Business Logic Decoupling from Tauri](pr2_core_decoupling.md)**
   - Isolates the scanner, indexer, and search algorithms from Tauri's GUI context.
   - Splits indexing into two separate tracks: LLM Metadata extraction and local E5 vector embedding.
   - Enables benchmark testing of these tracks independently.
3. **[PR 3: Standalone Evaluation Runner & AI Corpus Generator](pr3_eval_runner.md)**
   - Adds the `eval` CLI binary and ground-truth labeled JSON dataset (`evaluation_dataset.json`).
   - Supports AI-powered synthetic document generation to build a large test collection.
   - Explains Precision@1, Recall@3, and MRR (Mean Reciprocal Rank) metrics.
4. **[PR 4: Persistent Evaluation History Database & Analytics](pr4_eval_history.md)**
   - Implements a dedicated SQLite database (`evaluation_history.db`) in the application's local App Data directory.
   - Relocating the database to the App Data directory keeps history persistent across cargo cleanups and makes it accessible to both the CLI and the future React-based backoffice dashboard UI.
   - Adds CLI commands to list, detail, and compare historical runs.
5. **[PR 5: UI Settings Integration & Sidecar Setup](pr5_ui_integration.md)**
   - Bundles the local GGUF model execution engine (`llama-server`) as a sidecar.
   - Updates Settings UI panels and dropdowns for Local models and custom BYOM endpoints.

---

## Summary of Key Design Decisions

* **Mock Provider Usage:** The `MockProvider` simulates LLM outputs in memory. It lets us test the database operations, text extraction, local embedding generation, and score fusion locally, instantly (0.1s), for free, and without requiring any API keys or local servers.
* **Separable Evaluation Tracks:** By splitting indexing into independent LLM Metadata and Vector Embedding tracks, we can test and benchmark their accuracy and speed separately, comparing text/FTS vs. vector retrieval.
* **Ground Truth JSON:** Labeled datasets are stored in a static JSON file (`tests/evaluation_dataset.json`) containing reference queries and their expected target documents.
* **Metrics Formulas:** 
  - **Precision@1 (Hit@1):** Top search result is correct.
  - **Recall@3 (Hit@3):** A correct match is in the top 3 results.
  - **Mean Reciprocal Rank (MRR):** Reciprocal position of the first correct document ($1/\text{rank}$), averaged over all queries.
* **Database Placement:** The evaluation database is located in the local standard App Data directory right next to the active application database. This allows it to persist permanently, let the CLI log runs, and prepare the schema for a future backoffice admin UI.
