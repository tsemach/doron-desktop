import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// A dedicated database ("ascurix-office"), separate from apps/backend's
// (same local Postgres server, different DATABASE_URL) -- no table here is
// ever shared with apps/backend's `users`/`sessions`/etc.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("WARNING: DATABASE_URL is not set in environment variables");
}

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
