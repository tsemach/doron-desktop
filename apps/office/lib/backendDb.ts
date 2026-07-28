import { createDb } from "@workspace/backend-orm";

// Office's second database connection -- apps/backend's own customer DB
// (separate from office's own OFFICE_DATABASE_URL-backed `db` in
// ../database), used for admin actions on backend data (see app/api/users).
export const backendDb = createDb(process.env.BACKEND_DATABASE_URL!);
