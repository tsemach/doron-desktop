"use client";

import React from "react";
import { Search, Zap, HelpCircle } from "lucide-react";

export default function MainHelpFullTextSearch() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50/80 border border-amber-150 text-amber-700 text-xs font-semibold w-fit backdrop-blur-xs">
          <Search className="w-3.5 h-3.5 animate-pulse" />
          Intelligent Retrieval
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          Smart Full-Text Search
        </h2>
        
        <p className="text-slate-600 text-base sm:text-lg max-w-4xl leading-relaxed">
          Locate document segments, quotes, or metadata fields in milliseconds. Our dual FTS5 & vector-enabled search engine indexes full document content, matching natural language concepts as well as exact keyword patterns.
        </p>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center mb-3">
              <Zap className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">FTS5 Engine</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Fully optimized local SQLite FTS5 index scans millions of words instantly, pinpointing exactly which pages and files contain your query terms.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center mb-3">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">AI-Assisted Expansion</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Struggling to find the right terms? The search parses synonyms, legal terms, and contextual themes to expand your queries automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Screenshot Display Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Search Interface Preview
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            Full-Text Search Results & Highlights
          </span>
        </div>

        {/* Screenshot Display */}
        <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-950 shadow-inner group">
          <img
            src="/screenshot_smart_search_results.png"
            alt="Smart Search Engine (FTS5 Results)"
            className="w-full h-full object-cover opacity-95 group-hover:opacity-100 transition-opacity duration-300"
          />
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-lg border border-slate-800 shadow-lg">
            <p className="text-xs font-semibold text-white">
              Instant search results with match snippet highlighting and file locations
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
