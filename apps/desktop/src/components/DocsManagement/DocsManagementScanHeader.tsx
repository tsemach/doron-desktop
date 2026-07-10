export default function DocsManagementScanHeader() {
  return (
    <div className="text-center space-y-2">
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        Index Documents for AI Search
      </h2>
      <p className="text-sm text-muted-foreground max-w-lg mx-auto">
        Upload files or link local directories. Claude will parse text, extract metadata keywords,
        and generate vector embeddings for intelligent semantic search.
      </p>
    </div>
  );
}
