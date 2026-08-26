import { useAtomValue } from "jotai";
import { sessionAtom, sessionStatusAtom } from "@/store/authStore";
import UpdateBanner from "@/components/Updater/UpdateBanner";
import NotificationBell from "@/components/Notifications/NotificationBell";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const session = useAtomValue(sessionAtom);
  const sessionStatus = useAtomValue(sessionStatusAtom);
  const showBell = sessionStatus === "ready" && session !== null;

  return (
    <div className="relative h-screen">
      <UpdateBanner />
      {showBell && <NotificationBell />}
      {children}
    </div>
  );
}
