import { Briefcase, FolderGit2, Tags } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";

export default function KeyFeatureCaseManagementAndTraking() {
  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Briefcase}
        title="Case Management & Tracking"
        description="Streamline the lifecycle of your client matters. Ascurix Desktop lets you organize folders, files, and correspondences under specific case files, making sure you always have contextual information at your fingertips."
        bullets={[
          "Case codes, client metadata, and notes in one structured file",
          "Link documents, templates, and contracts to a case automatically",
          "Track status workflows and priority tags at a glance",
        ]}
        mockup={{
          type: "screenshot",
          src: "/screenshot_followup_badge.png",
          alt: "Active cases tracking and status badges",
        }}
      />

      <FeatureRowList
        items={[
          {
            icon: FolderGit2,
            title: "Structured Case Files",
            description: "Define case codes and client metadata, and link documents directly to a centralized file structure.",
          },
          {
            icon: Tags,
            title: "Actionable Status Badges",
            description: "Track workflows (Active, In Review, Closed) and assign priority tags to follow up instantly.",
          },
        ]}
      />
    </div>
  );
}
