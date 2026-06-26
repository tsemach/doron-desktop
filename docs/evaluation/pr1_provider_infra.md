# PR 1: Core AI Provider Infrastructure Layer

This phase introduces a unified, provider-agnostic LLM interface supporting online APIs, local models, custom Bring Your Own Model (BYOM) endpoints, and a mock simulator.

---

## 1. Provider Implementations

The system will define a generic `LlmProvider` enum in `llm_provider.rs` with delegates to individual concrete implementations:

1. **`ClaudeProvider` (llm_provider_entropic.rs):**
   - Calls the Anthropic Messages API (`https://api.anthropic.com/v1/messages`).
   - Uses the `ANTHROPIC_API_KEY` and models like `claude-3-5-sonnet-20241022` or `claude-3-5-haiku-20241022`.
2. **`GeminiProvider` (llm_provider_gemini.rs):**
   - Calls the Google Gemini API (`https://generativelanguage.googleapis.com/v1beta/models/...:generateContent`).
   - Uses the `GEMINI_API_KEY` and models like `gemini-1.5-flash` or `gemini-1.5-pro`.
3. **`OpenAiProvider` (llm_provider_openai.rs):**
   - Calls the OpenAI API or any OpenAI-compatible server.
   - Features a customizable `base_url: Option<String>` and handles empty API keys (routing to `http://localhost:11434/v1` for Ollama or `http://localhost:8080/v1` for `llama-server`).
4. **`MockProvider` (llm_provider_mock.rs):**
   - Simulates all model calls locally.

---

## 2. What is the Mock Provider Used For?

The `MockProvider` is an offline simulator that returns pre-configured, valid JSON structures. It serves several critical development and testing purposes:
* **Zero Cost & Latency:** Allows developers to execute the search/index flows instantly without incurring cloud API costs or waiting for API roundtrips.
* **Continuous Integration (CI/CD):** Enables automated tests to verify compilation, database schema integrity, text extraction, local embedding generation, and score fusion without needing internet access or active local LLM servers.
* **Deterministic Baseline:** Provides a stable baseline to verify that any changes to indexing or search code do not break the database layer.

---

## 3. Provider Configuration Factory

A factory function `get_active_provider` will map strings to the correct provider:
* `"gemini"` -> `LlmProvider::Gemini`
* `"openai"` -> `LlmProvider::OpenAi`
* `"local"` / `"ollama"` -> `LlmProvider::OpenAi` configured with local base URL.
* `"byom"` -> `LlmProvider::OpenAi` configured with custom endpoint details.
* `"mock"` -> `LlmProvider::Mock`

---

## 4. Testability & Verification

To verify this step, we will implement an offline unit test at `apps/desktop/src-tauri/tests/provider_test.rs` to verify that:
1. The `MockProvider` returns valid mock JSON matching the `DocumentMetadata` and `QueryAnalysis` schemas.
2. The `OpenAiProvider` correctly builds the target URL and authorization headers when custom endpoints are supplied.

### Verification Command
Run the test in WSL:
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test provider_test"
```
