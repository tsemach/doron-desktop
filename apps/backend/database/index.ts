import { createDb } from "@workspace/backend-orm";

// Connection/schema now live in @workspace/backend-orm (shared with
// apps/office, which points the same schema at its own BACKEND_DATABASE_URL
// connection instead). DATABASE_URL here is unchanged.
export const db = createDb(process.env.DATABASE_URL!);
