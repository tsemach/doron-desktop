import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

// Mirrors seed-admin.mjs's env loading so this script picks up the same
// DATABASE_URL you're already using for other office scripts, without
// requiring Next.js to load it for you.
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key in process.env) continue;
    const raw = trimmed.slice(eq + 1).trim();
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
console.log("SCRIPT_DIR: " + SCRIPT_DIR);
loadEnvFile(join(SCRIPT_DIR, "..", ".env"));
loadEnvFile(join(SCRIPT_DIR, "..", ".env.local"));

const [, , credentialsArg, languageArg, titlesFileArg] = process.argv;

if (!credentialsArg || !credentialsArg.includes(":")) {
  console.error("Usage: node scripts/upload-templates.mjs <email:password> [he|en] [titles-file]");
  process.exit(1);
}

const sepIndex = credentialsArg.indexOf(":");
const email = credentialsArg.slice(0, sepIndex);
const password = credentialsArg.slice(sepIndex + 1);

const language = (languageArg || "he").toLowerCase();
if (!["he", "en"].includes(language)) {
  console.error(`Invalid language "${languageArg}" -- must be "he" or "en".`);
  process.exit(1);
}

const titlesFilePath = resolve(SCRIPT_DIR, titlesFileArg || "../../upload-file-title.txt");
if (!existsSync(titlesFilePath)) {
  console.error(`Titles file not found: ${titlesFilePath}`);
  process.exit(1);
}

// DATABASE_URL is the one value that reliably tells us which deployment
// we're pointed at (local docker vs. production Neon), so it doubles as
// the environment switch for which office instance to upload against --
// override with OFFICE_BASE_URL to target a preview deployment instead.
const databaseUrl = process.env.OFFICE_DATABASE_URL || "";
const BASE_URL = process.env.OFFICE_BASE_URL || (databaseUrl.includes("neon.tech") ? "https://office.ascurix.com" : "http://localhost:3001");

const MIME_TYPES = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
};

// Entries look like: "U:\home\tsemach\tmp\docs-templates-for-upload\file.docx" - Title
function parseWindowsPath(winPath) {
  // The U: drive is this machine's WSL home mapped as a Windows drive letter,
  // so stripping the drive prefix and flipping separators recovers the real
  // Linux path (e.g. U:\home\tsemach\... -> /home/tsemach/...).
  return winPath.replace(/^[A-Za-z]:\\/, "/").replace(/\\/g, "/");
}

function parseTitlesFile(path) {
  const entries = [];
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^"(.+)"\s*-\s*(.+)$/);
    if (!match) {
      console.warn(`Skipping unparseable line: ${line}`);
      continue;
    }
    const [, winPath, title] = match;
    entries.push({ filePath: parseWindowsPath(winPath), title: title.trim() });
  }
  return entries;
}

// Logs in through the real NextAuth credentials flow (CSRF token, then the
// callback endpoint) rather than hitting the database directly, since
// /api/templates/upload is session-gated and only accepts a real cookie.
async function login() {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const csrfCookie = (csrfRes.headers.get("set-cookie") || "").split(";")[0];
  const { csrfToken } = await csrfRes.json();

  const body = new URLSearchParams({ email, password, csrfToken, json: "true" });
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookie,
    },
    body,
    redirect: "manual",
  });

  const setCookieHeaders =
    typeof loginRes.headers.getSetCookie === "function" ? loginRes.headers.getSetCookie() : [loginRes.headers.get("set-cookie")].filter(Boolean);

  const sessionCookies = setCookieHeaders.map((c) => c.split(";")[0]).filter((c) => /session-token=/i.test(c));

  if (sessionCookies.length === 0) {
    throw new Error("Login failed -- no session cookie returned. Check the email/password.");
  }

  return [csrfCookie, ...sessionCookies].join("; ");
}

async function uploadFile(cookie, filePath, title) {
  if (!existsSync(filePath)) {
    return { ok: false, error: `File not found: ${filePath}` };
  }
  const fileName = filePath.split("/").pop();
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const buffer = readFileSync(filePath);

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: MIME_TYPES[ext] || "application/octet-stream" }), fileName);
  form.append("title", title);
  form.append("language", language);

  const res = await fetch(`${BASE_URL}/api/templates/upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}

async function main() {
  const entries = parseTitlesFile(titlesFilePath);
  if (entries.length === 0) {
    console.error("No entries found in titles file.");
    process.exit(1);
  }

  console.log(`Target: ${BASE_URL}`);
  console.log(`Language: ${language}`);
  console.log(`Titles file: ${titlesFilePath} (${entries.length} entries)`);
  console.log(`Logging in as ${email}...`);
  const cookie = await login();
  console.log("Login succeeded.\n");

  let succeeded = 0;
  let failed = 0;
  for (const { filePath, title } of entries) {
    process.stdout.write(`Uploading "${title}" (${filePath})... `);
    const result = await uploadFile(cookie, filePath, title);
    if (result.ok) {
      console.log("OK");
      succeeded++;
    } else {
      console.log(`FAILED -- ${result.error}`);
      failed++;
    }
  }

  console.log(`\nDone: ${succeeded} succeeded, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
