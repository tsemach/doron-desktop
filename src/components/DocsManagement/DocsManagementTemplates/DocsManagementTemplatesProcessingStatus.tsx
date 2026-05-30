import { ProcessingState } from "./DocsManagementTemplates.types";

interface DocsManagementTemplatesProcessingStatusProps {
  processing: ProcessingState;
}

export default function DocsManagementTemplatesProcessingStatus({
  processing,
}: DocsManagementTemplatesProcessingStatusProps) {
  if (!processing) return null;

  return (
    <div
      className={`mx-6 mt-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold ${processing.status === "failed"
        ? "border-red-200 bg-red-50 text-red-800"
        : processing.status === "ok"
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-blue-200 bg-blue-50 text-blue-800"
        }`}
    >
      {processing.status === "processing" ? (
        <span className="inline-block animate-spin text-blue-500 font-bold">⟳</span>
      ) : processing.status === "ok" ? (
        <span className="text-green-500 font-bold">✓</span>
      ) : (
        <span className="text-red-500 font-bold">✗</span>
      )}
      <span>{processing.message}</span>
    </div>
  );
}
