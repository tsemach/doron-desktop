import { Layout, Compass, Lock, FileCheck } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";

export default function KeyFeatureCentralWorkingSpace() {
  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Layout}
        title="Central Working Space"
        description="At the core of Ascurix Desktop is a unified, highly optimized environment designed to bring all your legal and business operations into a single point of control. By eliminating scattered windows and fragmented apps, it enables seamless multitasking with zero friction."
        bullets={[
          "One dashboard for cases, documents, search, and email",
          "Local-first storage — everything stays on your own disk",
          "Zero-friction navigation between templates, search, and settings",
        ]}
        mockup={{
          type: "screenshot",
          src: "/screenshot_smart_search_results.png",
          alt: "Ascurix Desktop unified workspace",
        }}
      />

      <FeatureRowList
        items={[
          {
            icon: Layout,
            title: "Unified Control Panel",
            description: "Case records, communication history, document templates, and preferences in one dashboard.",
          },
          {
            icon: Compass,
            title: "Frictionless Navigation",
            description: "Cycle between summaries, search results, and email sync settings without losing context.",
          },
          {
            icon: Lock,
            title: "Local-First Security",
            description: "Indexed text, FTS5 structures, and API credentials remain stored securely on your disk.",
          },
          {
            icon: FileCheck,
            title: "Integrated Templates",
            description: "Generate pleadings, letters, and notices dynamically from case properties.",
          },
        ]}
      />
    </div>
  );
}
