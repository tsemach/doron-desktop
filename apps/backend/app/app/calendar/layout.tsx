import { isFeatureEnabled } from "../../../lib/featureGating";
import ComingSoon from "@/components/app/ComingSoon";

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabled("calendar")) {
    return <ComingSoon featureKey="nav_calendar" />;
  }
  return children;
}
