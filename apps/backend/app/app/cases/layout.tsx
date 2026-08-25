import { isFeatureEnabled } from "../../../lib/featureGating";
import ComingSoon from "@/components/app/ComingSoon";

export default function CasesLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabled("cases")) {
    return <ComingSoon featureKey="nav_cases" />;
  }
  return children;
}
