import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { db } from "../../database";
import { firms } from "../../database/schema";
import AppTopBar from "@/components/app/AppTopBar";
import ComingSoon from "@/components/app/ComingSoon";
import { isFeatureEnabled } from "../../lib/featureGating";
import { translations, type Language } from "../../locales/translations";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userName = session.user.name || session.user.email || null;
  const tier = (session.user as { tier?: string }).tier ?? "free";
  const firmId = (session.user as { firmId?: string | null }).firmId ?? null;
  // Server Component -- no LanguageProvider/useLanguage() available here, so
  // this reads the translation dictionary directly off the already-resolved
  // session locale instead (same value app/layout.tsx used for <html lang>).
  const locale: Language = (session.user as { locale?: string }).locale === "he" ? "he" : "en";
  const t = translations[locale];

  // Self-registered ("flat") users have no firm (see packages/backend-orm's
  // schema comment on users.firmId) -- fall back to a generic label instead
  // of showing a blank/undefined firm name.
  let workspaceLabel = t.personal_workspace;
  if (firmId) {
    const [firm] = await db.select({ name: firms.name }).from(firms).where(eq(firms.id, firmId)).limit(1);
    if (firm?.name) {
      workspaceLabel = firm.name;
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-white via-slate-50 to-indigo-50 text-slate-900 font-sans">
      <AppTopBar userName={userName} tier={tier} workspaceLabel={workspaceLabel} />
      <main className="flex-grow w-full">
        {isFeatureEnabled("app") ? children : <ComingSoon featureKey="nav_home" />}
      </main>
    </div>
  );
}
