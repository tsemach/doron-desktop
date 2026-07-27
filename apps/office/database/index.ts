import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuses the same Postgres instance as apps/backend (same DATABASE_URL,
// e.g. the shared local docker-compose Postgres) -- but only the
// `admin_users` table, never apps/backend's `users`/`sessions`/etc.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("WARNING: DATABASE_URL is not set in environment variables");
}

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
