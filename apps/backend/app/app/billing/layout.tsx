import { isFeatureEnabled } from "../../../lib/featureGating";
import ComingSoon from "@/components/app/ComingSoon";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabled("billing")) {
    return <ComingSoon featureKey="nav_billing" />;
  }
  return children;
}
