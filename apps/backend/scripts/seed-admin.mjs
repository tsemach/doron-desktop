import { existsSync, readFileSync } from "fs";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";

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

loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));
loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));

const DEV_ADMIN_EMAIL = "admin@admin.com";
const DEV_ADMIN_PASSWORD = "admin";
const DEV_ADMIN_NAME = "Admin";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Run from apps/backend with .env.local configured.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

try {
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [DEV_ADMIN_EMAIL]);
  if (existing.rowCount > 0) {
    console.log(`Dev admin already exists (${DEV_ADMIN_EMAIL})`);
    process.exit(0);
  }

  const passwordHash = bcrypt.hashSync(DEV_ADMIN_PASSWORD, bcrypt.genSaltSync(10));
  const now = new Date();

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, "emailVerified", tier, plan_selected_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), DEV_ADMIN_NAME, DEV_ADMIN_EMAIL, passwordHash, now, "pro", now]
  );

  console.log(`Created dev admin: ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}`);
} catch (error) {
  console.error("Failed to seed dev admin:", error);
  process.exit(1);
} finally {
  await pool.end();
}
