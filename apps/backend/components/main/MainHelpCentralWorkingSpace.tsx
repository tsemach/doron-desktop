"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Layout, Compass, Shield, ChevronLeft, ChevronRight, Lock, FileCheck } from "lucide-react";

export default function MainHelpCentralWorkingSpace() {
  // Screenshot Carousel State
  const [activeScreenshot, setActiveScreenshot] = useState(0);

  const screenshots = [
    {
      src: "/screenshot_smart_search_results.png",
      alt: "Smart Search Engine (FTS5 Results)",
      label: "FTS5 Search Results",
    },
    {
      src: "/screenshot_templates_hover.png",
      alt: "Document Preview & Templates Hover",
      label: "Document Preview & Template Manager",
    },
    {
      src: "/screenshot_followup_badge.png",
      alt: "Active Cases Tracking & Status Badges",
      label: "Case Tracker & Status System",
    },
  ];

  const handlePrevScreenshot = () => {
    setActiveScreenshot((prev) => (prev === 0 ? screenshots.length - 1 : prev - 1));
  };

  const handleNextScreenshot = () => {
    setActiveScreenshot((prev) => (prev === screenshots.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50/80 border border-blue-150 text-blue-700 text-xs font-semibold w-fit backdrop-blur-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
          </span>
          Secure Desktop Client
        </div>

        {/* Title styling matching desktop welcome headers */}
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          Central Working Space
        </h2>
        
        <p className="text-slate-600 text-base sm:text-lg max-w-4xl leading-relaxed">
          At the core of <strong>Amicus Desktop</strong> is a unified, highly optimized environment designed to bring all your legal and business operations into a single point of control. By eliminating scattered windows and fragmented apps, it enables seamless multitasking with zero friction.
        </p>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mb-3">
              <Layout className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Unified Control Panel</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Consolidate case records, client communication history, dynamic document templates, and system preferences inside a clean, modern dashboard.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center mb-3">
              <Compass className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Frictionless Navigation</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Quickly cycle between document summaries, global full-text search results, and email sync settings without ever losing your working context.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <Lock className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Local-First Security</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              All indexed text files, FTS5 relational structures, and personal API credentials remain stored securely on your local disk.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200">
            <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center mb-3">
              <FileCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-800 text-base mb-1.5">Integrated Templates</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Generate standardized pleadings, letters, and client notices dynamically from case properties using automated template placeholders.
            </p>
          </div>
        </div>
      </div>

      {/* Call to Actions matching desktop buttons styling */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/download" className="group">
          <div className="bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg px-6 py-3 shadow-md flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer text-sm hover:shadow-lg">
            <span>Download Desktop Installer</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
        <button
          onClick={() => {
            const el = document.getElementById("features-section");
            el?.scrollIntoView({ behavior: "smooth" });
          }}
          className="px-6 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center shadow-sm hover:border-slate-350"
        >
          Explore Features
        </button>
      </div>

      {/* Screenshot Carousel Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-blue-500" />
            <span>Interactive Platform Preview</span>
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            Active: {screenshots[activeScreenshot].label}
          </span>
        </div>

        {/* Screenshot Display */}
        <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-950 shadow-inner group">
          <img
            src={screenshots[activeScreenshot].src}
            alt={screenshots[activeScreenshot].alt}
            className="w-full h-full object-cover opacity-95 group-hover:opacity-100 transition-opacity duration-300"
          />
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-lg border border-slate-800 shadow-lg transition-transform duration-200 flex items-center justify-between">
            <p className="text-xs font-semibold text-white">
              {screenshots[activeScreenshot].alt}
            </p>
            <span className="text-[10px] text-slate-400 bg-slate-850 px-2 py-0.5 rounded border border-slate-800">
              {activeScreenshot + 1} / {screenshots.length}
            </span>
          </div>
        </div>

        {/* Carousel Controls */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handlePrevScreenshot}
            className="w-8 h-8 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-xs"
            title="Previous Screenshot"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex gap-2">
            {screenshots.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveScreenshot(i)}
                className={`h-2 rounded-full transition-all cursor-pointer duration-200 ${
                  activeScreenshot === i ? "bg-blue-600 w-6" : "bg-slate-200 hover:bg-slate-300 w-2"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={handleNextScreenshot}
            className="w-8 h-8 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-xs"
            title="Next Screenshot"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}