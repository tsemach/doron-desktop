Here is a complete, structured summary of our architectural discussion. You can copy and paste this directly into your development notes or product requirements document (PRD) for your desktop layer-management and document/email indexing application.

---

## 📝 Project Architecture Summary: Local Legal AI Engine

### 1. Core Objectives & Constraints

* **The Product:** A desktop application designed for lawyers/attorneys to automatically scan, index, search documents (hybrid SQL + vector metadata tracking) and classify incoming emails/attachments to cases.
* **Tech Stack:** Rust backend environment (e.g., Tauri desktop framework).
* **Hardware Constraints:** Target machines are standard lawyer desktops with modest specs (**8GB to 16GB RAM, average CPU**, typically no dedicated Nvidia GPU).
* **Primary Mandate:** 100% offline, local-first operation to achieve zero cloud costs and absolute client privacy/confidentiality.

---

### 2. The Recommended Local Models (GGUF Format, Q4 Quantization)

To guarantee the application runs smoothly without freezing the OS, models must be loaded as 4-bit quantized `.gguf` files. This allows you to offer a "Model Selection" dropdown menu tailored to the lawyer's hardware:

* **Qwen-2.5-1.5B-Instruct (~1.1 GB RAM footprint):**
* *Best for:* Lower-end 8GB RAM machines or "Battery Saver" modes. Blazing-fast execution on basic email classification, though it may struggle with highly complex, lengthy contracts.


* **Qwen-2.5-3B-Instruct (~1.9 GB RAM footprint):**
* *The Standard Choice:* The sweet spot for this app. It is exceptionally reliable at structured JSON formatting and code-like data parsing, making it perfect for extracting precise metadata to inject into your local SQL tables.


* **Phi-4-mini-instruct (3.8B Parameters, ~2.2 GB RAM footprint):**
* *Best for:* 16GB RAM machines and heavy documents. It boasts an native 128K token context window out-of-the-box, making it the ideal choice when a lawyer drops a massive, multi-page legal trial transcript or complex contract into the application.


* **Gemma 4 E4B (~2.5 GB RAM footprint):**
* *Alternative:* Highly capable at agent-based execution and includes multimodal capabilities if you ever want to handle direct visual image patches (OCR-less processing), though it has a slightly higher RAM overhead.


* **Embeddings Track:** Use ultra-lightweight models like `bge-small-en-v1.5` or `all-MiniLM-L6-v2` (under 100MB) for your parallel semantic search track.

---

### 3. Final Architectural Verdict: Option B (The Managed Sidecar)

We evaluated two integration patterns and selected **Option B** as the production-grade choice.

* **How it Works:** You bundle `llama-server` (the highly optimized executable built by the `llama.cpp` ecosystem) directly inside your Tauri application as a **native sidecar binary**.
* **The Network Bridge:** When your application boots, your Rust backend executes the sidecar, binding it strictly to a local loopback port (`127.0.0.1:XXXX`). Your Rust code then communicates with the model using a standard HTTP client (`reqwest` or `async-openai`) using the uniform **OpenAI REST API specification (`/v1/chat/completions`)**.

#### Why Option B Wins over Option A (In-Process FFI Bindings):

1. **The Crash Barrier:** If a lawyer uploads a corrupted PDF or a massive file that causes the AI model to run out of memory (OOM), only the *sidecar* crashes. Your main Rust UI process stays completely active. Your backend can cleanly catch the exit code, alert the user, and auto-restart the engine without data loss.
2. **Painless Model Toggling:** To switch between Qwen and Phi in the user interface, your Rust backend simply stops the running sidecar process (instantly purging 2GB+ of RAM back to the operating system) and spins up a new sidecar process pointing to the other model's `.gguf` file path.
3. **Automatic Prompt Formatting:** `llama-server` reads the `.gguf` file metadata and automatically applies the specific chat templates (e.g., `<|im_start|>` for Phi/Qwen vs `<start_of_turn>` for Gemma). Your Rust application sends the exact same clean JSON payloads regardless of the model chosen.

---

### 4. Critical Optimizations for "Lawyer Hardware"

1. **Onboarding Downloads:** Keep your initial application installer tiny (~50MB). Use a first-time setup wizard in Tauri to securely download the user's chosen 1–2GB `.gguf` files directly into their local user data folder (`AppData` on Windows / `Application Support` on macOS).
2. **Map-Reduce Document Processing:** To save CPU cycles and prevent RAM spikes on long documents, have your Rust parser extract the text of the first 3 pages and the last 3 pages (where case names, dates, jurisdictions, and signatures usually reside) to pass to the model for SQL metadata extraction.
3. **Thread Priorities:** Restrict `llama-server` to using a subset of the CPU's total threads (e.g., limit it to 4 threads on an 8-core machine) so the lawyer's computer remains completely fluid and responsive during background indexing.