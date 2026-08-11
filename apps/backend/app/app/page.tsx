import { eq } from "drizzle-orm";
import { auth } from "../../auth";
import { db } from "../../database";
import { firms } from "../../database/schema";

export default async function AppHomePage() {
  const session = await auth();
  const firmId = (session?.user as { firmId?: string | null } | undefined)?.firmId ?? null;

  // Self-registered ("flat") users have no firm (see packages/backend-orm's
  // schema comment on users.firmId) -- fall back to a generic label instead
  // of showing a blank/undefined firm name.
  let workspaceLabel = "Personal workspace";
  if (firmId) {
    const [firm] = await db.select({ name: firms.name }).from(firms).where(eq(firms.id, firmId)).limit(1);
    if (firm?.name) {
      workspaceLabel = firm.name;
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
      <p className="text-sm text-slate-500 mt-2">{workspaceLabel}</p>
    </div>
  );
}
