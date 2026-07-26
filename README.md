# Doron Desktop — Developer Onboarding & Setup Guide

Doron Desktop is a legal/case management platform combining a local **Tauri v2 desktop client** (React + TypeScript frontend + Rust backend) and a **Next.js web portal backend** (for authentication, user dashboard, and installer downloads). 

The project is structured as a `pnpm` monorepo.

---

## 1. Repository Structure

* **`apps/desktop/`** — The Tauri-based desktop client.
  * `src/` — React frontend built with TypeScript, Vite, Tailwind v4, and shadcn/ui.
  * `src-tauri/` — Rust desktop app shell (handles local files, database transactions, IMAP sync, database versioning).
* **`apps/backend/`** — Next.js 15 web application providing the user portal, logins, secure sessions (via NextAuth v5), and dynamic installer asset redirects.
* **`packages/ui/`** — Shared UI components and configurations across frontend workspaces.

---

## 2. Prerequisites

Before starting, ensure your local development environment has the following tools installed:

### Global Core Tools
* **Node.js**: Version `20.x` or `22.x` (LTS recommended)
* **pnpm**: Version `10.x` (Package manager used for monorepo workspaces)
* **Rust & Cargo**: Latest stable Rust toolchain (install via [rustup.rs](https://rustup.rs/))

### Operating System Build Tools (For Tauri Compilations)
* **Windows**:
  * Install C++ Build Tools via the [Visual Studio Build Tools Installer](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (select the **Desktop development with C++** workload).
  * Tauri v2 uses **NSIS** to compile setup installers. The installer packages are automatically downloaded by Tauri during the first build.
* **macOS / Linux**:
  * Refer to the official [Tauri v2 Prerequisite Guide](https://v2.tauri.app/start/prerequisites/) for your system.
* **WSL (Windows Subsystem for Linux)**:
  * If compiling/running inside WSL, ensure you have **WSLg** (WSL GUI) active to allow GUI window rendering on your host Windows desktop. WSLg is a built-in feature of Windows 11 (and recent Windows 10 versions) that allows Linux GUI applications running inside WSL to render their window interface natively on your Windows desktop.

---

## 3. Environment Setup & Installation

Follow these steps to get your workspace set up locally:

### Step A: Install Dependencies
Run from the repository root:
```bash
pnpm install
```

### Step B: Database & Environment Configurations
1. Navigate to the backend directory:
   ```bash
   cd apps/backend
   ```
2. Start the local PostgreSQL instance using Docker Compose:
   ```bash
   docker compose up -d
   ```
   This will spin up a local PostgreSQL container pre-configured for the backend.
3. Copy the sample environment file:
   ```bash
   cp .env.example .env.local
   ```
4. Open `.env.local` and configure your credentials. Here is the list of environment variables used in the project:

   | Variable Name | Description | How to Obtain / Configure |
   | :--- | :--- | :--- |
   | `DATABASE_URL` | Connection URL for local PostgreSQL database. | When running PostgreSQL locally via Docker Compose, set this to `postgresql://postgres:postgres@localhost:5432/doron_db`. |
   | `DATABASE_NEON` | Connection URL for Neon cloud PostgreSQL instance (optional fallback). | Sign up on [Neon.tech](https://neon.tech), spin up a free serverless PostgreSQL database, and copy the database connection string. |
   | `AUTH_SECRET` | Salt key used by NextAuth to encrypt session tokens and secure cookies. | Generate a secure key by running `npx auth secret` in your terminal. |
   | `AUTH_GOOGLE_ID` <br> `AUTH_GOOGLE_SECRET` | Credentials required to enable Google OAuth login in the portal. | Create a project in [Google Cloud Console](https://console.cloud.google.com/), configure your OAuth Consent Screen, and create a **Web application** client ID. Add `http://localhost:3000/api/auth/callback/google` to the Authorized Redirect URIs. |
   | `AUTH_FACEBOOK_ID` <br> `AUTH_FACEBOOK_SECRET` | Credentials required to enable Facebook OAuth login in the portal. | Create an app on [Meta for Developers](https://developers.facebook.com/), activate Facebook Login product, and add `http://localhost:3000/api/auth/callback/facebook` as a Client OAuth redirect URI. |
   | `VERCEL_TOKEN` | Token for deploying the web portal to Vercel via CLI integrations. | Go to your Vercel Dashboard -> Account Settings -> **Tokens** -> Click **Create** to get a new API token. |
5. Run migrations to initialize the schema:
   ```bash
   pnpm db:push
   ```
6. Seed the local dev admin account (idempotent — safe to re-run):
   ```bash
   pnpm db:seed
   ```
   Credentials: `admin@admin.com` / `admin`

---

## 4. Development Commands

Run the following commands from the **workspace root** to run, build, or verify projects:

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Run full dev stack (parallelizes Tauri dev client + Next.js web portal) |
| `pnpm desktop:dev` | Start only the Tauri desktop app in dev mode (opens the GUI window) |
| `pnpm backend:dev` | Start only the Next.js web portal dev server (defaults to port `3000`) |
| `pnpm build` | Compile code across all workspaces |
| `pnpm desktop:release` | Build the Tauri desktop app executable locally (Windows NSIS) |
| `pnpm lint` | Run ESLint checks across all code workspaces |

---

## 5. Releases & Auto-Updater Integration

We use a secure auto-update system powered by **GitHub Actions** and **Tauri Cryptographic Signatures**.

### One-Time Signing Setup (To deploy updates)
If you need to publish update releases that installed applications can download:

1. **Generate your cryptographic keypair** locally:
   ```bash
   pnpm --filter desktop tauri signer generate
   ```
2. **Configure the Public Key**:
   Open `apps/desktop/src-tauri/tauri.conf.json` and paste your generated public key into:
   ```json
   "plugins": {
     "updater": {
       "pubkey": "YOUR_GENERATED_PUBLIC_KEY"
     }
   }
   ```
3. **Save your Private Key in GitHub Secrets**:
   Go to your GitHub repository -> Settings -> Secrets and variables -> Actions. Add a **Repository Secret** named `TAURI_SIGNING_PRIVATE_KEY` and paste the private key.

### Publishing a New Release
Our build pipeline is fully automated via GitHub Actions:
1. Bump the version inside `apps/desktop/src-tauri/tauri.conf.json` (e.g. `"version": "0.1.2"`).
2. Commit and push the version bump.
3. Tag and push a release tag matching `v*`:
   ```bash
   git tag v0.1.2
   git push origin v0.1.2
   ```
The CI/CD pipeline will automatically build the Windows `.exe` installer, sign it, generate the `latest.json` update manifest, and upload all assets to a draft GitHub Release.

---

## 6. Email Integration (Google Gmail Setup)

To allow the application to ingest and index emails from a Google Gmail account via IMAP, standard password logins are blocked by Google. You must configure an **App Password**:

1. **Enable IMAP in Gmail Settings**:
   * Open Gmail in your web browser.
   * Go to **Settings** (gear icon) -> **See all settings** -> **Forwarding and POP/IMAP** tab.
   * Under **IMAP Access**, select **Enable IMAP** and click **Save Changes**.
2. **Generate a Google App Password**:
   * Go to your [Google Account Security Settings](https://myaccount.google.com/security).
   * Ensure **2-Step Verification** is turned on (this is required to generate App Passwords).
   * Search for "App passwords" in the search bar or go directly to the App Passwords page.
   * Enter a name (e.g. `Doron Desktop Email Sync`) and click **Create**.
   * Copy the generated **16-character passcode** (you won't be able to see it again).
3. **Configure the App Settings**:
   * Open the desktop app, go to **Settings** -> **Email Integration**.
   * **IMAP Host**: `imap.gmail.com`
   * **IMAP Port**: `993`
   * **Username**: Your full Gmail address (e.g., `user@gmail.com`).
   * **Password / App Token**: Paste the **16-character passcode** you copied from Google (without spaces).
   * Click **Save Preferences**.
