interface CaseTemplateHelpProps {
  onClose?: () => void;
}

export default function CaseTemplateHelp({ onClose }: CaseTemplateHelpProps) {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300 min-w-0 space-y-4 relative overflow-hidden h-full text-foreground flex flex-col justify-between">
      {/* Background Accent Decorative Glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {/* Help Icon */}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-base tracking-tight text-foreground flex items-center gap-2">
              Case & Document Templates Guide
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                Workflow Overview
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Learn how Document Templates and Case Templates interact to generate full document packages automatically.
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            aria-label="Close help"
          >
            {/* Close X Icon */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Top Graphic: SVG Diagram stretched almost full width */}
      <div className="w-full bg-slate-900/5 dark:bg-slate-950/40 rounded-xl border border-border/60 p-2.5 sm:p-3 flex flex-col items-center justify-center overflow-hidden shadow-inner shrink-0">
        <div className="w-full max-w-[1050px] mx-auto">
          <img
            src="/case-template-help.svg"
            onError={(e) => {
              // Fallback to relative path if absolute root path fails in Tauri
              const target = e.currentTarget;
              if (target.src.endsWith('/case-template-help.svg')) {
                target.src = './case-template-help.svg';
              }
            }}
            alt="Case Template Generation Workflow Diagram"
            className="w-full h-auto max-h-[250px] sm:max-h-[270px] object-contain rounded-lg transition-transform duration-200 hover:scale-[1.005]"
          />
        </div>
      </div>

      {/* 3-Step Detailed Graphical Flow Section */}
      <div className="space-y-2.5 shrink-0 px-1">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            {/* Sparkles Icon */}
            <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
            </svg>
            Step-by-Step Breakdown
          </h4>
          <span className="text-[11px] text-muted-foreground italic">
            Single-entry data entry across all your templates
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 relative">
          {/* STEP 1 */}
          <div className="group relative rounded-xl border border-blue-500/20 bg-gradient-to-b from-blue-500/5 to-transparent p-3.5 flex flex-col justify-between transition-all duration-200 hover:border-blue-500/40 hover:shadow-md">
            <div className="space-y-2.5">
              {/* Step Circle Header */}
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:scale-110 transition-transform">
                  1
                </div>
                <div>
                  <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    {/* FileText Icon */}
                    <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Document Templates
                  </h5>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                    Word files (.docx) with fields
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Standard Word files created in MS Word containing variable placeholders. Add placeholders anywhere in your documents.
              </p>

              {/* Graphical Placeholder Badges */}
              <div className="bg-background/80 rounded-lg p-2 border border-border/80 space-y-1">
                <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Example Placeholders:
                </span>
                <div className="flex flex-wrap gap-1">
                  <code className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/20">
                    {"{{ full-name }}"}
                  </code>
                  <code className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/20">
                    {"{{ id_number }}"}
                  </code>
                  <code className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/20">
                    {"{{ date }}"}
                  </code>
                </div>
              </div>
            </div>

            {/* Desktop Connector Arrow (Positioned cleanly without overflowing outer container) */}
            <div className="hidden md:flex absolute right-[-10px] top-1/2 -translate-y-1/2 z-10 size-5 rounded-full bg-card border border-border text-muted-foreground items-center justify-center shadow-sm">
              <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </div>

          {/* STEP 2 */}
          <div className="group relative rounded-xl border border-indigo-500/20 bg-gradient-to-b from-indigo-500/5 to-transparent p-3.5 flex flex-col justify-between transition-all duration-200 hover:border-indigo-500/40 hover:shadow-md">
            <div className="space-y-2.5">
              {/* Step Circle Header */}
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-md shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                  2
                </div>
                <div>
                  <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    {/* Layers Icon */}
                    <svg className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                    Case Template
                  </h5>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                    Unified Workflow Box
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Groups multiple document templates into a single case type. Automatically collects all unique fields into <b>one central form</b>.
              </p>

              {/* Graphical Feature Box */}
              <div className="bg-background/80 rounded-lg p-2 border border-border/80 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                  <span className="inline-block size-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Enter Fields Once
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Variables appearing across 10 documents only need to be typed in once when creating a new case.
                </p>
              </div>
            </div>

            {/* Desktop Connector Arrow (Positioned cleanly without overflowing outer container) */}
            <div className="hidden md:flex absolute right-[-10px] top-1/2 -translate-y-1/2 z-10 size-5 rounded-full bg-card border border-border text-muted-foreground items-center justify-center shadow-sm">
              <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </div>

          {/* STEP 3 */}
          <div className="group relative rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent p-3.5 flex flex-col justify-between transition-all duration-200 hover:border-emerald-500/40 hover:shadow-md">
            <div className="space-y-2.5">
              {/* Step Circle Header */}
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shadow-md shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                  3
                </div>
                <div>
                  <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    {/* CheckCircle Icon */}
                    <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Generated Case Docs
                  </h5>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Ready-to-use file bundle
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                When you save a new case, all associated Word files are generated instantly with your data populated accurately.
              </p>

              {/* Graphical Result Box */}
              <div className="bg-background/80 rounded-lg p-2 border border-border/80 space-y-1">
                <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Your Case is Ready!
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    <span className="size-1 rounded-full bg-emerald-500" />
                    document-1.docx
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    <span className="size-1 rounded-full bg-emerald-500" />
                    document-2.docx
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    <span className="size-1 rounded-full bg-emerald-500" />
                    document-n.docx
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
