import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openPath } from "@tauri-apps/plugin-opener";
import { useLanguage } from "../../../context/LanguageContext";

interface CaseEmail {
  id: number;
  case_id: number;
  message_id: string;
  sender: string;
  recipient: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  direction: "incoming" | "outgoing";
  received_at: string;
  attachments_json: string;
}

interface Attachment {
  name: string;
  staged_path: string;
  size_kb: number;
  is_imported?: boolean;
}

interface CaseEmailsChatProps {
  caseId: number;
  caseFolder?: string;
}

export default function CaseEmailsChat({ caseId, caseFolder }: CaseEmailsChatProps) {
  const [emailsCount, setEmailsCount] = useState(0);
  const { t } = useLanguage();
  const [emails, setEmails] = useState<CaseEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selected email for detail view
  const [selectedEmail, setSelectedEmail] = useState<CaseEmail | null>(null);
  
  // Track expanded emails in the chat view
  const [expandedEmails, setExpandedEmails] = useState<Record<number, boolean>>({});
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEmailsCount(0); // Reset count on case change so it scrolls to the bottom
    loadEmails();

    // Listen for real-time case emails updates
    const unlisten = listen("case-emails-updated", (event) => {
      const updatedCaseId = event.payload as number;
      if (updatedCaseId === caseId) {
        fetchCaseEmailsFromDb();
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [caseId]);

  useEffect(() => {
    // Scroll to bottom only when emails load for the first time OR when a new email is added (length increases)
    if (emails.length > emailsCount) {
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
    setEmailsCount(emails.length);
  }, [emails]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedEmail(null);
      }
    };

    if (selectedEmail) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedEmail]);

  async function fetchCaseEmailsFromDb() {
    try {
      const res = await invoke<CaseEmail[]>("list_case_emails", { caseId });
      const sorted = [...res].sort(
        (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
      );
      setEmails(sorted);
    } catch (err) {
      console.error("Failed to load case emails from DB:", err);
      setError(String(err));
    }
  }

  async function loadEmails() {
    setLoading(true);
    setError(null);
    try {
      // 1. Force network check on Gmail in the background (non-blocking in Rust)
      try {
        await invoke("trigger_email_ingestion");
      } catch (ingestErr) {
        console.warn("Failed to trigger background email ingestion:", ingestErr);
      }
      
      // 2. Fetch all linked emails for this case from DB immediately
      await fetchCaseEmailsFromDb();
    } catch (err) {
      console.error(err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenAttachment(att: Attachment) {
    try {
      let filePath = att.staged_path;
      if (att.is_imported && caseFolder && !filePath.toLowerCase().includes(caseFolder.toLowerCase().replace(/\\/g, "/"))) {
        filePath = `${caseFolder}/${att.name}`.replace(/\\/g, "/");
      }
      await openPath(filePath);
    } catch (e) {
      console.error("Failed to open attachment:", e);
      alert(`Failed to open file: ${e}`);
    }
  }

  function formatTime(isoString: string) {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "";
    }
  }

  function formatDateHeader(isoString: string) {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return "";
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] dark:bg-zinc-950 relative">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-border px-4 py-2 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-zinc-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200">
            ✉
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">
              {t("emails_exchange") || "Case Email Correspondence"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {emails.length} {t("messages") || "messages"}
            </p>
          </div>
        </div>

        <button
          onClick={loadEmails}
          disabled={loading}
          className="p-1.5 hover:bg-muted border border-border rounded-lg text-muted-foreground hover:text-foreground cursor-pointer transition-colors flex items-center justify-center disabled:opacity-50"
          title={t("refresh")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={loading ? "animate-spin" : ""}
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.72 2.78L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>

      {/* Chat workspace area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="animate-spin text-3xl font-bold mb-2">⟳</div>
            <p className="text-sm">{t("loading_files")}</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-destructive">
            <p className="font-semibold">{t("error_loading_files")}</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        ) : emails.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center text-2xl mb-4 text-slate-400">
              ✉
            </div>
            <p className="text-sm font-semibold">{t("no_emails") || "No email correspondence found for this case."}</p>
            <p className="text-xs text-muted-foreground/80 mt-1 max-w-[280px]">
              {t("no_emails_desc") || "Once configured, matched case emails will show up here in a chat-style history."}
            </p>
          </div>
        ) : (
          <>
            {emails.map((email, idx) => {
              const isIncoming = email.direction === "incoming";
              const attachments: Attachment[] = JSON.parse(email.attachments_json || "[]");
              
              // Show a date divider if the date changes
              const showDateHeader = idx === 0 || 
                new Date(email.received_at).toDateString() !== new Date(emails[idx - 1].received_at).toDateString();

              return (
                <div key={email.id} className="flex flex-col w-full">
                  {showDateHeader && (
                    <div className="self-center bg-white/70 dark:bg-zinc-800/80 backdrop-blur-xs text-muted-foreground text-[10px] px-3 py-1 rounded-full shadow-xs border border-border/40 my-3 font-semibold uppercase tracking-wider">
                      {formatDateHeader(email.received_at)}
                    </div>
                  )}
                  
                  <div 
                    onClick={() => setSelectedEmail(email)}
                    className={`max-w-[70%] cursor-pointer group flex flex-col rounded-xl px-3.5 py-2.5 shadow-xs transition-all hover:shadow-sm ${
                      isIncoming 
                        ? "self-start bg-white dark:bg-zinc-900 border border-border/30 rounded-tl-none text-left" 
                        : "self-end bg-[#d9fdd3] dark:bg-emerald-950/80 rounded-tr-none text-left"
                    }`}
                  >
                    {/* Header info */}
                    <div className="flex justify-between items-center gap-4 border-b border-border/20 pb-1 mb-1">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                        {isIncoming ? email.sender : t("you") || "You"}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {formatTime(email.received_at)}
                      </span>
                    </div>

                    {/* Subject */}
                    <div className="font-semibold text-xs text-foreground/90 truncate mb-1" dir="auto">
                      {email.subject}
                    </div>

                    {/* Snippet / Text */}
                    <div className="text-sm text-foreground/80 break-words leading-normal whitespace-pre-wrap" dir="auto">
                      <p>
                        {email.body_text && email.body_text.length > 250 && !expandedEmails[email.id]
                          ? `${email.body_text.slice(0, 250)}...`
                          : email.body_text}
                      </p>
                      {email.body_text && email.body_text.length > 250 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedEmails(prev => ({
                              ...prev,
                              [email.id]: !prev[email.id]
                            }));
                          }}
                          className="mt-1.5 text-xs font-semibold text-[#007acc] dark:text-[#38bdf8] hover:underline cursor-pointer select-none focus:outline-none focus:ring-0"
                        >
                          {expandedEmails[email.id] ? t("show_less") : t("show_more")}
                        </button>
                      )}
                    </div>

                    {/* Attachments inside bubble */}
                    {attachments.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-border/20 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                          📎 {t("attachments") || "Attachments"} ({attachments.length})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {attachments.map((att, aIdx) => (
                            <button
                              key={aIdx}
                              onClick={() => handleOpenAttachment(att)}
                              className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors cursor-pointer max-w-[200px] ${
                                att.is_imported
                                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold"
                                  : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 border border-border/40 text-foreground/80"
                              }`}
                              title={att.is_imported ? `${att.name} (Imported to Case)` : att.name}
                            >
                              <span className="truncate max-w-[120px] font-medium">
                                {att.is_imported ? `✓ ${att.name}` : att.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">({att.size_kb} KB)</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </>
        )}
      </div>

      {/* Full Email Modal Viewer */}
      {selectedEmail && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-6 z-50 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-border rounded-2xl w-full max-w-2xl h-[80%] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border bg-muted/35 flex justify-between items-center shrink-0">
              <div>
                <h4 className="font-bold text-base text-foreground truncate max-w-[450px]" dir="auto">
                  {selectedEmail.subject}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("date") || "Date"}: {new Date(selectedEmail.received_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="p-1.5 hover:bg-muted border border-border rounded-lg text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Meta tags */}
            <div className="px-6 py-3 bg-muted/10 border-b border-border/80 text-xs text-foreground/80 flex flex-col gap-1 shrink-0">
              <div><strong className="text-muted-foreground">{t("from") || "From"}:</strong> {selectedEmail.sender}</div>
              <div><strong className="text-muted-foreground">{t("to") || "To"}:</strong> {selectedEmail.recipient}</div>
            </div>

            {/* Modal Body scroll */}
            <div className="flex-1 overflow-y-auto p-6 bg-background/50 dark:bg-background/25" dir="auto">
              {selectedEmail.body_html ? (
                <div 
                  className="prose dark:prose-invert max-w-none text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }} 
                />
              ) : (
                <pre className="font-sans text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                  {selectedEmail.body_text}
                </pre>
              )}
            </div>

            {/* Modal Attachments footer */}
            {(() => {
              const attachments: Attachment[] = JSON.parse(selectedEmail.attachments_json || "[]");
              if (attachments.length === 0) return null;
              return (
                <div className="px-6 py-4 border-t border-border bg-muted/15 flex flex-col gap-2 shrink-0">
                  <span className="text-xs font-bold text-muted-foreground">
                    📎 {t("attachments") || "Attachments"} ({attachments.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((att, aIdx) => (
                      <button
                        key={aIdx}
                        onClick={() => handleOpenAttachment(att)}
                        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          att.is_imported
                            ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-bold"
                            : "bg-muted hover:bg-accent border border-border text-foreground/90"
                        }`}
                        title={att.is_imported ? `${att.name} (Imported to Case)` : att.name}
                      >
                        <span className="font-semibold">
                          {att.is_imported ? `✓ ${att.name}` : att.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">({att.size_kb} KB)</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
