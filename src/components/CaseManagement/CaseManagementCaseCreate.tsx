import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";

interface CaseTemplate {
  id: number;
  name: string;
  fields: string; // JSON string representing string[]
}

export default function CaseManagementCaseCreate() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [templates, setTemplates] = useState<CaseTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("empty");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Split-pane resizing states
  const [leftPercent, setLeftPercent] = useState(45);
  const [isDragging, setIsDragging] = useState(false);
  const [isLgScreen, setIsLgScreen] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsLgScreen(window.innerWidth >= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("create-case-split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      const clamped = Math.max(25, Math.min(75, percentage));
      setLeftPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    // Fetch case templates from SQLite
    invoke<CaseTemplate[]>("list_case_templates")
      .then((res) => {
        setTemplates(res);
      })
      .catch((err) => {
        console.error("Failed to list case templates:", err);
        setError("Failed to load case templates.");
      });
  }, []);

  // Parse fields for the currently selected template
  const activeTemplate = templates.find((t) => String(t.id) === selectedTemplateId);
  const templateFields: string[] = activeTemplate ? JSON.parse(activeTemplate.fields) : [];

  // Reset/sync fields when template changes
  useEffect(() => {
    const initialValues: Record<string, string> = {};
    templateFields.forEach((field) => {
      initialValues[field] = "";
    });
    setFieldValues(initialValues);
    setSearchQuery(""); // Reset search query when template changes
  }, [selectedTemplateId]);

  const filteredTemplateFields = templateFields.filter((field) =>
    field.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Verify if case storage folder is already in use by another case
  useEffect(() => {
    if (!folder.trim()) {
      setError((prev) =>
        prev === "A case with this storage directory path already exists." ? null : prev
      );
      return;
    }

    const checkFolder = async () => {
      try {
        const inUse = await invoke<boolean>("verify_folder_in_use", { folderPath: folder.trim() });
        if (inUse) {
          setError("A case with this storage directory path already exists.");
        } else {
          setError((prev) =>
            prev === "A case with this storage directory path already exists." ? null : prev
          );
        }
      } catch (err) {
        console.error("verify_folder_in_use failed:", err);
      }
    };

    const timer = setTimeout(checkFolder, 300);
    return () => clearTimeout(timer);
  }, [folder]);

  // Browse Directory Dialog
  async function handleBrowse() {
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Case Storage Directory",
      });
      if (selected && typeof selected === "string") {
        setFolder(selected);
      }
    } catch (err) {
      console.error("Directory browse error:", err);
      setError("Failed to open folder picker.");
    }
  }

  // Handle Form Submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!subject.trim()) {
      setError("Please enter a case subject.");
      return;
    }
    if (!name.trim()) {
      setError("Please enter a customer name.");
      return;
    }
    if (!folder.trim()) {
      setError("Please select or enter the case folder path.");
      return;
    }

    setLoading(true);
    try {
      // Proactively check if the folder is in use one last time before creating
      const inUse = await invoke<boolean>("verify_folder_in_use", { folderPath: folder.trim() });
      if (inUse) {
        setError("A case with this storage directory path already exists.");
        setLoading(false);
        return;
      }

      const isTemplate = selectedTemplateId !== "empty";
      const templateIdNum = isTemplate ? Number(selectedTemplateId) : null;

      // Call Rust backend command
      await invoke("create_new_case", {
        subject: subject.trim(),
        name: name.trim(),
        folder: folder.trim(),
        caseTemplateId: templateIdNum,
        fieldValues,
      });

      // Redirect back to case list on success
      navigate("/case-management");
    } catch (err) {
      console.error("Case creation failed:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const hasFields = selectedTemplateId !== "empty" && templateFields.length > 0;

  const leftFields = (
    <>
      {/* Subject */}
      <div className="space-y-1">
        <label htmlFor="subject" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Case Subject
        </label>
        <input
          id="subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Eviction Notice, Acquisition Agreement"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
          disabled={loading}
        />
      </div>

      {/* Customer Name */}
      <div className="space-y-1">
        <label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Customer Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. John Doe, Acme Corp"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
          disabled={loading}
        />
      </div>

      {/* Folder Path */}
      <div className="space-y-1">
        <label htmlFor="folder" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Case Directory Path
        </label>
        <p className="text-xs text-muted-foreground">
          All templates and case files will reside in this directory.
        </p>
        <div className="flex gap-2">
          <input
            id="folder"
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="Select or type folder path..."
            className="flex-1 rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all font-mono"
            disabled={loading}
          />
          <Button type="button" variant="secondary" onClick={handleBrowse} disabled={loading} className="px-5 py-3 h-auto">
            Browse...
          </Button>
        </div>
      </div>

      {/* Template Selector */}
      <div className="space-y-1">
        <label htmlFor="template" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Case Template
        </label>
        <select
          id="template"
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all h-[46px]"
          disabled={loading}
        >
          <option value="empty">Create Empty Case (No Documents)</option>
          {templates.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  return (
    <main className="flex-1 overflow-auto p-4 bg-background">
      <div className={`space-y-4 ${hasFields ? "max-w-none w-full" : "max-w-2xl"} transition-all duration-300`}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create New Case</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fill in the details below to initialize a new case and configure its workspace.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            id="create-case-split-container"
            className={
              hasFields
                ? `flex ${isLgScreen ? "flex-row gap-0 h-[calc(100vh-220px)] lg:h-[calc(100vh-200px)] min-h-[350px]" : "flex-col gap-4"} items-stretch relative ${
                    isDragging ? "select-none cursor-col-resize" : ""
                  }`
                : "space-y-4"
            }
          >
            {/* Left Column: Main Case Details */}
            <div
              className={`rounded-lg border border-border bg-card p-4 space-y-3 ${
                hasFields && isLgScreen ? "shrink-0 overflow-y-auto" : ""
              }`}
              style={hasFields && isLgScreen ? { flex: `0 0 calc(${leftPercent}% - 6px)` } : undefined}
            >
              {leftFields}
            </div>

            {/* Resizable Divider (rendered only on large screens when fields are shown) */}
            {hasFields && isLgScreen && (
              <div
                onMouseDown={() => setIsDragging(true)}
                className={`w-3 group cursor-col-resize flex items-center justify-center shrink-0 z-20 select-none ${
                  isDragging ? "bg-primary/10" : "hover:bg-primary/5"
                } transition-colors`}
              >
                <div
                  className={`w-1 h-12 rounded-full ${
                    isDragging ? "bg-primary" : "bg-border/60 group-hover:bg-primary/50"
                  } transition-colors`}
                />
              </div>
            )}

            {/* Right Column: Dynamic Template Fields */}
            {hasFields && (
              <div
                className={`rounded-lg border border-border bg-card p-4 space-y-3 animate-in fade-in slide-in-from-right-4 duration-300 min-w-0 flex flex-col ${
                  isLgScreen ? "h-full" : ""
                }`}
                style={isLgScreen ? { flex: "1 1 0%" } : undefined}
              >
                <div>
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    Template Fields ({activeTemplate?.name})
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enter real values for the template variables. Unfilled fields will remain as placeholders.
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative max-w-xs mt-1 mb-2">
                  <input
                    type="text"
                    placeholder="Search fields..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-mono"
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground font-semibold text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {filteredTemplateFields.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground bg-muted/10">
                    No template fields match your search query.
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-2 pb-2">
                      {filteredTemplateFields.map((field) => (
                        <div key={field} className="space-y-0.5">
                          <label htmlFor={`field-${field}`} className="text-xs font-mono font-medium text-muted-foreground truncate block" title={field}>
                            {field}
                          </label>
                          <input
                            id={`field-${field}`}
                            type="text"
                            placeholder={`Value...`}
                            value={fieldValues[field] || ""}
                            onChange={(e) => setFieldValues({ ...fieldValues, [field]: e.target.value })}
                            className="w-full rounded-md border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all font-mono"
                            disabled={loading}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/case-management")}
              disabled={loading}
              className="px-6 py-2.5 h-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="px-6 py-2.5 h-auto">
              {loading ? "Creating..." : "Create Case"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
