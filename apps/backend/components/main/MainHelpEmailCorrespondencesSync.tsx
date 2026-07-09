"use client";

import React from "react";
import { Mail, Check, RefreshCw } from "lucide-react";

export default function MainHelpEmailCorrespondencesSync() {
  const steps = [
    {
      title: "Secure IMAP Sync",
      desc: "Connects directly and securely to your IMAP email account in the background.",
    },
    {
      title: "Contextual Matching",
      desc: "Scans sender addresses, headers, and topics to match correspondences to cases.",
    },
    {
      title: "Auto-Attachment",
      desc: "Downloads contracts and document attachments directly into target case folders.",
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50/80 border border-sky-150 text-sky-700 text-xs font-semibold w-fit backdrop-blur-xs">
          <Mail className="w-3.5 h-3.5" />
          Email Integration
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          Email Correspondences Sync
        </h2>
        
        <p className="text-slate-600 text-base sm:text-lg max-w-4xl leading-relaxed">
          Amicus Desktop eliminates the chore of manual correspondence filing. By connecting your active mail client to the workspace, you can automatically ingest incoming legal queries and lock attachments to their corresponding files.
        </p>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center mb-3">
              <RefreshCw className="w-5 h-5 animate-spin-slow" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Direct Sync Engine</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              No middleman or web portals. Connect directly to standard email providers via secure IMAP configuration, keeping your communications completely confidential.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center mb-3">
              <Check className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Automatic Mapping</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              AI-driven parsing scans message context, case subjects, or sender names, then maps conversations to the correct folder dynamically.
            </p>
          </div>
        </div>
      </div>

      {/* Workflow display card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm space-y-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Email Matching Pipeline
        </h3>
        
        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          {/* Connecting Line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -translate-y-1/2 hidden md:block z-0" />
          
          {steps.map((step, idx) => (
            <div key={idx} className="relative z-10 flex items-start md:flex-col md:items-center gap-4 md:text-center flex-1">
              <div className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-md">
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
