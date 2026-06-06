---
name: debug
description: >-
  Guides the agent in compiling, running, and visually inspecting a Tauri-based React application inside WSL (Windows Subsystem for Linux) using Cargo, pnpm, and Playwright.
---

# WSL Tauri Application Debugging

## Overview
This skill provides a standard operating procedure for compiling, launching, and visually debugging this Tauri/React desktop application inside a WSL (Windows Subsystem for Linux) developer environment.

## Dependencies
None.

## Quick Start

### 1. Compile the Rust Backend
Verify that the Rust code builds cleanly:
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo check --manifest-path src-tauri/Cargo.toml"
```

### 2. Launch the Application (Headed / Dev)
To compile the backend and start the application in development mode:
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && pnpm tauri dev"
```

### 3. Check UI Visually (Headless Playwright)
If the Vite dev server is running on `http://localhost:1420/`, execute the Playwright inspection script to get DOM output and capture a visual screenshot (`screenshot.png`):
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && node scratch/check_ui.js"
```

---

## Workflow

To compile, run, and debug the application successfully, follow this step-by-step procedure:

### 1. Shell & Environment Context Setup
> [!IMPORTANT]
> **Use Interactive Shells (`zsh -i` or `bash -i`):**
> WSL non-interactive shells do **not** source `.bashrc` or `.zshrc` profile configurations. This means tools managed by version managers (like `nvm`, `node`, `npm`, and `pnpm`) will **not** be on the system PATH.
> Always prefix commands inside WSL with `zsh -i -c` or `bash -i -c` (prefer `zsh -i -c`).

### 2. Compiling the Rust Backend
* Always verify syntax and compilation before launching the application:
  ```bash
  wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo check --manifest-path src-tauri/Cargo.toml"
  ```
* If compilation fails, **stop immediately** and report the compiler errors to the user. Do not try to write auto-fixes for compiler errors without user guidance.

### 3. Running the Dev Server (Headless/Headed)
* To run the complete desktop application (compiles Rust and spawns the GUI window on the host Windows desktop via WSLg):
  ```bash
  wsl --cd ~ zsh -i -c "cd projects/doron-desktop && pnpm tauri dev"
  ```
* To run **only the frontend** Vite dev server (for headless/visual automation testing on port 1420):
  ```bash
  wsl --cd ~ zsh -i -c "cd projects/doron-desktop && pnpm dev"
  ```

### 4. Playwright Headless Automation & Visual Inspection
If you need to check how the React UI behaves, use Playwright to load the page off-screen:
1. Ensure the development server is active on `http://localhost:1420/`.
2. Write/use a headless automation script (e.g. `scratch/check_ui.js`) to:
   * Navigate to `http://localhost:1420/` using Playwright's Chromium.
   * Wait for React elements (like `#root`) to mount.
   * Save a visual screenshot of the application page (e.g., `screenshot.png` in the project root).
   * Evaluate the DOM state and print the HTML structure to standard output.
3. Run the script:
   ```bash
   wsl --cd ~ zsh -i -c "cd projects/doron-desktop && node scratch/check_ui.js"
   ```
4. Read the printed DOM, check the captured image using the file viewer, and verify correct UI behaviors.

---

## Common Mistakes & Pitfalls

* **Using `npm` instead of `pnpm`:** This project uses `pnpm` for package management. Never run `npm run tauri dev` or `npm dev`; always use `pnpm`.
* **Not using interactive shell (`-i`):** Forgetting to pass `-i` when invoking WSL will cause commands like `pnpm` or `node` to return `command not found` errors.
* **Ignoring Port Conflicts:** The Vite dev server is configured with `strictPort: true` on port `1420`. If the port is already bound to another running instance, launching the server will fail. Always verify active ports using `ss -tuln` before starting.
* **Auto-installing libraries:** If Playwright/Chromium crashes due to missing OS system dependencies (e.g. `libnspr4.so`), do **not** run install commands silently. Stop and report the issue to the user immediately.
