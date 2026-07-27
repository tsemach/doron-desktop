import { auth } from "../auth";
import UserMenu from "../components/UserMenu";

export default async function OfficeHome() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex justify-end p-4">
        <UserMenu name={session?.user?.name} email={session?.user?.email} />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-2">
        <h1 className="text-2xl font-semibold">Amicus Back Office</h1>
        <p className="text-muted-foreground">Nothing here yet.</p>
      </main>
    </div>
  );
}
