import { isFeatureEnabled } from "../../../lib/featureGating";
import ComingSoon from "@/components/app/ComingSoon";

export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabled("documents")) {
    return <ComingSoon featureKey="nav_documents" />;
  }
  return children;
}
