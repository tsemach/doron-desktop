# Global Project Instructions & Context

This file contains general guidelines, tech stack details, and environment configurations for all AI agents working on this project. Please read this file carefully before performing any code modifications or running commands.

---

## 1. Project Overview
This is a desktop legal case management application that helps index files, manage cases, search documents, and integrate with email channels for linking incoming case correspondence.

## 2. Tech Stack & Architecture
* **Frontend:** React 19, Vite 6, TypeScript, Tailwind CSS 4.
* **Backend:** Rust (Tauri v2 Desktop Framework).
* **Database:** Local SQLite database (`documents.db`) stored in the application data directory.

---

## 3. Environment & Operating Context
> [!IMPORTANT]
> **WSL Development Environment:**
> The project codebase and toolchain run inside **WSL (Windows Subsystem for Linux)**. The host operating system is Windows, and the agent terminal runs in Windows PowerShell.
> 
> Therefore, all commands targeting the application (compiling, running, testing) must be executed inside WSL by prefixing them with:
> `wsl --cd ~ zsh -i -c "..."` (or `bash -i -c` if needed).
> 
> The `-i` (interactive) flag is **mandatory** to load your profile setup (NVM, node version, pnpm paths).

---

## 4. Development Commands

### Compile Rust Backend:
Verify compilation health inside WSL:
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo check --manifest-path src-tauri/Cargo.toml"
```

### Start Application (Headed/Desktop):
Launch both Vite dev server and Tauri Rust client:
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && pnpm tauri dev"
```

### Start Frontend Dev Server Only (Headless):
Run Vite frontend server on port 1420 (strict):
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && pnpm dev"
```

### Headless UI Inspection:
Verify UI rendering and extract screenshot using Playwright:
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && node scratch/check_ui.js"
```

---

## 5. Coding & Safety Rules

* **Package Manager:** Always use `pnpm` for installing and managing dependencies. Never run `npm` or `yarn` commands.
* **Error Handling & Safety:**
  * If any build step, cargo check, or custom test script fails, **immediately stop and ask the user for guidance**. Do not attempt to guess or auto-fix compiler errors without confirmation.
  * Do not run package installation commands that alter system libraries (e.g. `sudo apt-get`) silently.
  * In the Rust backend, handle database queries and migrations safely. Ensure new tables or alterations do not overwrite existing user data.
