"use client";

import React from "react";
import { Cpu, FileSpreadsheet, FileText } from "lucide-react";

export default function MainHelpDocumentIndexing() {
  const steps = [
    {
      title: "File Ingestion",
      desc: "Supports PDF, Word (.docx), Excel (.xlsx), and Text (.txt) formats.",
    },
    {
      title: "AI Analysis",
      desc: "Extracts key metadata, summaries, topics, and critical dates using Claude API.",
    },
    {
      title: "Index Persistence",
      desc: "Saves structured attributes to SQLite database for lightning-fast queries.",
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50/80 border border-indigo-150 text-indigo-700 text-xs font-semibold w-fit backdrop-blur-xs">
          <Cpu className="w-3.5 h-3.5" />
          AI Feature Suite
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          AI Document Indexing
        </h2>
        
        <p className="text-slate-600 text-base sm:text-lg max-w-4xl leading-relaxed">
          Amicus Desktop uses cutting-edge LLMs (such as Anthropic Claude) to analyze your documentation. Instead of manually reviewing files to extract key terms or dates, the system processes them in the background to automatically build a structured profile.
        </p>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mb-3">
              <FileText className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Auto-Generated Summaries</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Every document receives a concise, AI-drafted executive summary. Understand the essence of a 50-page contract in less than 10 seconds.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center mb-3">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Metadata Extraction</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Automatically identify filing dates, authors, counterparty details, and legal topics without manual tagging.
            </p>
          </div>
        </div>
      </div>

      {/* Step Progress Display Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm space-y-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Extraction Workflow Pipeline
        </h3>
        
        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          {/* Connecting Line (for MD screens) */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -translate-y-1/2 hidden md:block z-0" />
          
          {steps.map((step, idx) => (
            <div key={idx} className="relative z-10 flex items-start md:flex-col md:items-center gap-4 md:text-center flex-1">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-md">
                {idx + 1}
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-800">{step.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[200px]">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
