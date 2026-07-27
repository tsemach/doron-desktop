import { auth } from "../auth";
import SignOutButton from "../components/SignOutButton";

export default async function OfficeHome() {
  const session = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Amicus Back Office</h1>
      <p className="text-muted-foreground">Signed in as {session?.user?.email}. Nothing here yet.</p>
      <SignOutButton />
    </main>
  );
}
