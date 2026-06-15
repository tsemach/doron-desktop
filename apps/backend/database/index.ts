import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Retrieve the database connection URL from environment variables
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("WARNING: DATABASE_URL is not set in environment variables");
}

const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });
