import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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
}

interface CaseEmailsChatProps {
  caseId: number;
}

export default function CaseEmailsChat({ caseId }: CaseEmailsChatProps) {
  const { t } = useLanguage();
  const [emails, setEmails] = useState<CaseEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selected email for detail view
  const [selectedEmail, setSelectedEmail] = useState<CaseEmail | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadEmails();
  }, [caseId]);

  useEffect(() => {
    // Scroll to bottom when emails load
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [emails]);

  async function loadEmails() {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<CaseEmail[]>("list_case_emails", { caseId });
      setEmails(res);
    } catch (err) {
      console.error(err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenAttachment(stagedPath: string) {
    try {
      await openPath(stagedPath);
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
      {/* WhatsApp header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-border px-4 py-2 flex items-center gap-3 shrink-0 shadow-xs">
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
                    <div className="font-semibold text-xs text-foreground/90 truncate mb-1">
                      {email.subject}
                    </div>

                    {/* Snippet / Text */}
                    <p className="text-sm text-foreground/80 break-words leading-normal whitespace-pre-wrap">
                      {email.body_text}
                    </p>

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
                              onClick={() => handleOpenAttachment(att.staged_path)}
                              className="inline-flex items-center gap-1.5 text-xs bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 border border-border/40 px-2 py-1 rounded-md transition-colors cursor-pointer text-foreground/80 max-w-[200px]"
                              title={att.name}
                            >
                              <span className="truncate max-w-[120px] font-medium">{att.name}</span>
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
                <h4 className="font-bold text-base text-foreground truncate max-w-[450px]">
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
            <div className="flex-1 overflow-y-auto p-6 bg-background/50 dark:bg-background/25">
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
                        onClick={() => handleOpenAttachment(att.staged_path)}
                        className="inline-flex items-center gap-1.5 text-xs bg-muted hover:bg-accent border border-border px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-foreground/90"
                      >
                        <span className="font-semibold">{att.name}</span>
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
