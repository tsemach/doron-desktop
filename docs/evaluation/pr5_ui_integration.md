# PR 5: Sidecar Process Management & UI Settings Integration

This phase integrates the provider-agnostic infrastructure layer into the Tauri desktop application, enabling users to select, configure, and connect to local GGUF models or Bring Your Own Model (BYOM) endpoints via the Settings UI.

---

## 1. Local Model Sidecar Architecture (Option B)

To keep the application desktop-native and avoid manual installation dependencies (like Ollama or Python) for the end-user, we use Tauri's **Sidecar** capability:
* **The sidecar binary:** We bundle a pre-compiled, highly-optimized `llama-server` (from the `llama.cpp` project) for the target platform (Windows/Linux).
* **Process Lifecycle:** 
  - On app launch, if `ai_mode` is set to `"local"`, Tauri spins up `llama-server` in the background, bound to `127.0.0.1` on a random open port.
  - The backend communicates with `llama-server` via the OpenAI-compatible endpoint using the newly modified `OpenAiProvider` (setting `base_url` to `http://localhost:<port>/v1`).
  - If the Tauri app closes, the sidecar process is terminated, releasing memory.

---

## 2. Settings Database Configuration

The `ai_configurations` table stores the active configurations:
- `ai_mode`: `"local"` | `"online"` | `"byom"`
- `provider`: `"gemini"` | `"openai"` | `"anthropic"` | `"other"`
- `ai_model`: Model label (e.g. `qwen2.5-3b-instruct-q4`, `gemini-1.5-flash`).
- `api_key_enc`: Encrypted API credentials (empty/ignored for local models).
- `custom_url`: Custom base URL for BYOM or custom local servers.

---

## 3. UI Frontend Integrations

We will update the frontend settings interface:
1. **Model Selection Dropdown:**
   - **Online Mode:** Presets for Claude, Gemini, and GPT models.
   - **Local Mode:** Presets for hardware-optimized local models (`Qwen-2.5-3B-Instruct (Q4)`, `Qwen-2.5-1.5B-Instruct (Q4)`, `Phi-4-mini-Instruct (Q4)`).
   - **BYOM Mode:** Inputs to specify a custom model name, endpoint URL, and API key.
2. **Health Check Indicator:**
   - Displays a success message and latency indicator after performing a test call to the configured LLM engine.

---

## 4. Testability & Verification

### Verification Checklist
1. **Dev Application Startup:**
   Launch the app in development:
   ```bash
   wsl --cd ~ zsh -i -c "cd projects/doron-desktop && pnpm tauri dev"
   ```
2. **BYOM Verification:**
   - Go to Settings, select "Bring Your Own Model".
   - Enter a custom OpenAI-compatible endpoint URL (e.g. a proxy or third-party provider), save, and run a connection health check.
3. **Local Mode Verification:**
   - Go to Settings, select "Local Model", select Qwen 2.5 3B, and trigger the connection test.
   - Index a document in the app and verify metadata extraction and vector chunks succeed.
4. **End-to-End CLI Eval Validation:**
   Run evaluation on the local endpoint:
   ```bash
   wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin eval -- --provider local --model qwen2.5:3b --algorithm hybrid-rerank"
   ```
   Verify that the CLI output shows correct latency and retrieval statistics.
