import { useState, useEffect } from "react";
import { Button } from "../../ui/button";
import { useLanguage } from "../../../context/LanguageContext";
import { Download, Loader2, Search, X } from "lucide-react";
import { TemplateRow } from "./DocsManagementTemplates.types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

interface DownloadableTemplate {
  url: string;
  fileName: string;
  size: number;
  uploadedAt: string;
  title: string;
}

interface DocsManagementTemplatesDownloadModalProps {
  localTemplates: TemplateRow[];
  onConfirmDownload: (selected: { url: string; fileName: string; title: string }[]) => void;
  onCancel: () => void;
}

export default function DocsManagementTemplatesDownloadModal({
  localTemplates,
  onConfirmDownload,
  onCancel,
}: DocsManagementTemplatesDownloadModalProps) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadables, setDownloadables] = useState<DownloadableTemplate[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    fetchTemplates();
  }, [language]);

  async function fetchTemplates() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/templates?lang=${language}`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      const blobsList: any[] = data.templates || [];

      // Filter out files that already exist locally
      const filtered = blobsList
        .filter((bt) => !localTemplates.some((lt) => lt.file_name.toLowerCase() === bt.fileName.toLowerCase()))
        .map((bt) => {
          // Format filename to a clean human-readable default title
          const baseName = bt.fileName.substring(0, bt.fileName.lastIndexOf(".")) || bt.fileName;
          const cleanTitle = baseName
            .replace(/[_-]/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
          return {
            url: `${BACKEND_URL}/api/templates/download?url=${encodeURIComponent(bt.url)}`,
            fileName: bt.fileName,
            size: bt.size,
            uploadedAt: bt.uploadedAt,
            title: cleanTitle,
          };
        });

      setDownloadables(filtered);
    } catch (err: any) {
      console.error(err);
      setError(`Failed to fetch templates from backend: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  const toggleSelect = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const handleTitleChange = (url: string, newTitle: string) => {
    setDownloadables((prev) =>
      prev.map((item) => (item.url === url ? { ...item, title: newTitle } : item))
    );
  };

  const toggleSelectAll = () => {
    if (selectedUrls.size === filteredList.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(filteredList.map((item) => item.url)));
    }
  };

  const filteredList = downloadables.filter(
    (item) =>
      item.fileName.toLowerCase().includes(filterQuery.toLowerCase()) ||
      item.title.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const handleDownload = () => {
    const selectedItems = downloadables
      .filter((item) => selectedUrls.has(item.url))
      .map((item) => ({
        url: item.url,
        fileName: item.fileName,
        title: item.title,
      }));
    onConfirmDownload(selectedItems);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">Download Document Templates</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Available in Vercel Blob store for language: <strong className="text-primary uppercase">{language}</strong>
            </p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-2">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Fetching templates from Vercel Blob...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-3 p-4">
              <div className="text-destructive text-sm font-semibold">Error</div>
              <p className="text-xs text-muted-foreground max-w-md">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchTemplates}>
                Retry
              </Button>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-2">
              <p className="text-sm font-semibold text-foreground">No templates to download</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                All templates in the backend repository for <strong className="uppercase">{language}</strong> are already present in your local vault.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Search and Bulk Toggle */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search downloadable templates..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                  />
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
                </div>
                <Button size="sm" variant="outline" onClick={toggleSelectAll} className="text-xs">
                  {selectedUrls.size === filteredList.length ? "Deselect All" : "Select All"}
                </Button>
              </div>

              {/* Templates List Table */}
              <div className="border border-border rounded-md overflow-hidden bg-muted/5">
                <div className="grid grid-cols-[auto_1fr_1.5fr_auto] gap-4 p-2.5 bg-muted/20 border-b border-border text-xs font-bold text-muted-foreground">
                  <div></div>
                  <div>File Name</div>
                  <div>Template Title (Editable)</div>
                  <div className="text-right">Size</div>
                </div>
                <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                  {filteredList.map((item) => (
                    <div
                      key={item.url}
                      className={`grid grid-cols-[auto_1fr_1.5fr_auto] gap-4 items-center p-2.5 hover:bg-muted/10 transition-colors text-xs text-foreground ${
                        selectedUrls.has(item.url) ? "bg-primary/5" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUrls.has(item.url)}
                        onChange={() => toggleSelect(item.url)}
                        className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                      />
                      <div className="font-mono truncate select-none" title={item.fileName}>
                        {item.fileName}
                      </div>
                      <div>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleTitleChange(item.url, e.target.value)}
                          disabled={!selectedUrls.has(item.url)}
                          className="w-full px-2 py-1 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring text-foreground disabled:opacity-50 disabled:bg-muted/10"
                          placeholder="Enter a template title"
                        />
                      </div>
                      <div className="text-right text-muted-foreground font-mono">
                        {formatSize(item.size)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-border/80 flex justify-between items-center bg-muted/5">
          <div className="text-xs text-muted-foreground">
            {selectedUrls.size} of {filteredList.length} templates selected
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selectedUrls.size === 0 || loading}
              onClick={handleDownload}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download {selectedUrls.size > 0 ? `(${selectedUrls.size})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
