"use client";

import React from "react";
import { Tag, FileEdit, FolderHeart } from "lucide-react";

export default function MainHelpDocumentTagsAndNotes() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50/80 border border-rose-150 text-rose-700 text-xs font-semibold w-fit backdrop-blur-xs">
          <Tag className="w-3.5 h-3.5" />
          Workspace Classification
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          Document Tags & Notes
        </h2>
        
        <p className="text-slate-600 text-base sm:text-lg max-w-4xl leading-relaxed">
          Enhance your files with custom taxonomy. Attach quick annotations, tags, notes, and priority marks directly to any document without modifying the underlying source files.
        </p>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <FileEdit className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Rich Annotations</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Add persistent case notes, descriptions, review items, and draft summaries to files. Ideal for logging internal guidelines or reminders.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center mb-3">
              <FolderHeart className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Custom Categorization</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Group disparate cases or templates under shared tags like "Contracts," "Urgent Review," or "Awaiting Signature" for instant filtering.
            </p>
          </div>
        </div>
      </div>

      {/* Preview Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Document Previews & Metadata Hover
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            Active Templates & Flags Viewer
          </span>
        </div>

        {/* Screenshot Display */}
        <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-950 shadow-inner group">
          <img
            src="/screenshot_templates_hover.png"
            alt="Document Preview & Templates Hover"
            className="w-full h-full object-cover opacity-95 group-hover:opacity-100 transition-opacity duration-300"
          />
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-lg border border-slate-800 shadow-lg">
            <p className="text-xs font-semibold text-white">
              Instant tooltip previews displaying file templates, tags, and summary cards on hover
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
