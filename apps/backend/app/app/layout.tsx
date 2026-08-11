import { redirect } from "next/navigation";
import { auth } from "../../auth";
import AppTopBar from "@/components/app/AppTopBar";

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

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <AppTopBar userName={userName} tier={tier} />
      <main className="flex-grow w-full">{children}</main>
    </div>
  );
}
