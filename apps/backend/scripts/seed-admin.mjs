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

// Overridable via env vars (SEED_EMAIL/SEED_PASSWORD/SEED_NAME/SEED_ROLE/
// SEED_TIER) so `ascurix local init` can reuse this same script to seed a
// distinct per-worktree user (packages/ascurix/lib/local/commands.sh)
// instead of duplicating the insert logic -- plain `pnpm --filter backend
// db:seed` with no overrides keeps seeding the original dev admin exactly
// as before.
const SEED_EMAIL = process.env.SEED_EMAIL || "admin@admin.com";
const SEED_PASSWORD = process.env.SEED_PASSWORD || "admin";
const SEED_NAME = process.env.SEED_NAME || "Admin";
const SEED_ROLE = process.env.SEED_ROLE || "flat";
const SEED_TIER = process.env.SEED_TIER || "pro";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Run from apps/backend with .env.local configured.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

try {
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [SEED_EMAIL]);
  if (existing.rowCount > 0) {
    console.log(`Seed user already exists (${SEED_EMAIL})`);
    process.exit(0);
  }

  const passwordHash = bcrypt.hashSync(SEED_PASSWORD, bcrypt.genSaltSync(10));
  const now = new Date();

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, "emailVerified", tier, plan_selected_at, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), SEED_NAME, SEED_EMAIL, passwordHash, now, SEED_TIER, now, SEED_ROLE]
  );

  console.log(`Created seed user: ${SEED_EMAIL} / ${SEED_PASSWORD} (role: ${SEED_ROLE})`);
} catch (error) {
  console.error("Failed to seed user:", error);
  process.exit(1);
} finally {
  await pool.end();
}
