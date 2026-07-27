import { auth } from "../../auth";
import OfficeSidebar from "../../components/OfficeSidebar";
import UserMenu from "../../components/UserMenu";

// Shared chrome for the authenticated area (home, templates, ...) -- /login
// and /register deliberately live outside this route group and don't get
// the sidebar/top bar.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex min-h-screen">
      <OfficeSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex justify-end p-4">
          <UserMenu name={session?.user?.name} email={session?.user?.email} />
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
