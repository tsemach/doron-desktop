import { Cpu, FileText, FileSpreadsheet } from "lucide-react";
import FeatureBlock from "@/components/marketing/FeatureBlock";
import FeatureRowList from "@/components/marketing/FeatureRowList";

export default function KeyFeatureDocumentIndexing() {
  return (
    <div className="space-y-4">
      <FeatureBlock
        icon={Cpu}
        title="AI Document Indexing"
        description="Ascurix Desktop uses cutting-edge LLMs (such as Anthropic Claude) to analyze your documentation. Instead of manually reviewing files to extract key terms or dates, the system processes them in the background to automatically build a structured profile."
        bullets={[
          "File ingestion — PDF, Word (.docx), Excel (.xlsx), and text",
          "AI analysis — extracts summaries, topics, and critical dates",
          "Index persistence — structured attributes saved for instant queries",
        ]}
        mockup={{ type: "illustrated", label: "Extraction Workflow Pipeline" }}
      />

      <FeatureRowList
        items={[
          {
            icon: FileText,
            title: "Auto-Generated Summaries",
            description: "Every document gets a concise, AI-drafted summary — understand a 50-page contract in seconds.",
          },
          {
            icon: FileSpreadsheet,
            title: "Metadata Extraction",
            description: "Automatically identify filing dates, authors, counterparty details, and legal topics.",
          },
        ]}
      />
    </div>
  );
}
