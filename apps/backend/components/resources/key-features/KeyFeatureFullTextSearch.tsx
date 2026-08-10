import { Search, Zap, HelpCircle } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";

export default function KeyFeatureFullTextSearch() {
  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Search}
        title="Smart Full-Text Search"
        description="Locate document segments, quotes, or metadata fields in milliseconds. Our dual FTS5 & vector-enabled search engine indexes full document content, matching natural language concepts as well as exact keyword patterns."
        bullets={[
          "Local SQLite FTS5 index scans millions of words instantly",
          "Pinpoints exactly which pages and files match your query",
          "AI-assisted query expansion for synonyms and legal terms",
        ]}
        mockup={{
          type: "screenshot",
          src: "/screenshot_smart_search_results.png",
          alt: "Smart search engine (FTS5 results)",
        }}
      />

      <FeatureRowList
        items={[
          {
            icon: Zap,
            title: "FTS5 Engine",
            description: "Fully optimized local SQLite FTS5 index pinpoints exactly which pages and files match your terms.",
          },
          {
            icon: HelpCircle,
            title: "AI-Assisted Expansion",
            description: "Parses synonyms, legal terms, and contextual themes to expand your queries automatically.",
          },
        ]}
      />
    </div>
  );
}
