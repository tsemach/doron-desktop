import { Mail, RefreshCw, Check } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";

export default function KeyFeatureEmailCorrespondencesSync() {
  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Mail}
        title="Email Correspondences Sync"
        description="Ascurix Desktop eliminates the chore of manual correspondence filing. By connecting your active mail client to the workspace, you can automatically ingest incoming legal queries and lock attachments to their corresponding files."
        bullets={[
          "Secure IMAP sync connects to your email account in the background",
          "Contextual matching maps correspondence to the right case",
          "Attachments download straight into the target case folder",
        ]}
        mockup={{ type: "illustrated", label: "Email Matching Pipeline" }}
      />

      <FeatureRowList
        items={[
          {
            icon: RefreshCw,
            title: "Direct Sync Engine",
            description: "Connect directly to standard email providers via secure IMAP — no middleman or web portal.",
          },
          {
            icon: Check,
            title: "Automatic Mapping",
            description: "AI-driven parsing maps conversations to the correct case folder dynamically.",
          },
        ]}
      />
    </div>
  );
}
