import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// A dedicated database ("ascurix-office"), separate from apps/backend's
// (same local Postgres server, different connection string) -- no table
// here is ever shared with apps/backend's `users`/`sessions`/etc. Backend's
// own DB is reachable separately via lib/backendDb.ts (BACKEND_DATABASE_URL).
const connectionString = process.env.OFFICE_DATABASE_URL;

if (!connectionString) {
  console.warn("WARNING: OFFICE_DATABASE_URL is not set in environment variables");
}

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
