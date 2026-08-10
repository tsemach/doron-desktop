import { Tag, FileEdit, FolderHeart } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";

export default function KeyFeatureDocumentTagsAndNotes() {
  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Tag}
        title="Document Tags & Notes"
        description="Enhance your files with custom taxonomy. Attach quick annotations, tags, notes, and priority marks directly to any document without modifying the underlying source files."
        bullets={[
          "Persistent case notes and draft summaries attached to files",
          "Custom tags like “Contracts” or “Urgent Review” for instant filtering",
          "Nothing important gets buried in the folder tree",
        ]}
        mockup={{
          type: "screenshot",
          src: "/screenshot_templates_hover.png",
          alt: "Document preview and templates hover",
        }}
      />

      <FeatureRowList
        items={[
          {
            icon: FileEdit,
            title: "Rich Annotations",
            description: "Add persistent case notes, descriptions, and review items to log guidelines or reminders.",
          },
          {
            icon: FolderHeart,
            title: "Custom Categorization",
            description: "Group cases or templates under shared tags for instant filtering.",
          },
        ]}
      />
    </div>
  );
}
