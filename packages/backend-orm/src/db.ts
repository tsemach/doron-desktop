import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// A factory, not a singleton -- apps/backend and apps/office each connect to
// this schema with their own connection string (DATABASE_URL vs
// BACKEND_DATABASE_URL respectively), so the pool can't be created at
// module-load time from a single hardcoded env var.
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export type BackendDb = ReturnType<typeof createDb>;
