import DocsHeader from "@/components/app/documents/DocsHeader";
import ScanIndexClient from "@/components/app/documents/ScanIndexClient";

export default function ScanPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <DocsHeader />
      <ScanIndexClient />
    </div>
  );
}
