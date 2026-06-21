"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function MainHelpCentralWorkingSpace() {
  // Screenshot Carousel State
  const [activeScreenshot, setActiveScreenshot] = useState(0);

  const screenshots = [
    {
      src: "/screenshot_smart_search_results.png",
      alt: "Smart Search Engine (FTS5 Results)",
    },
    {
      src: "/screenshot_templates_hover.png",
      alt: "Document Preview & Templates Hover",
    },
    {
      src: "/screenshot_followup_badge.png",
      alt: "Active Cases Tracking & Status Badges",
    },
  ];

  const handlePrevScreenshot = () => {
    setActiveScreenshot((prev) => (prev === 0 ? screenshots.length - 1 : prev - 1));
  };

  const handleNextScreenshot = () => {
    setActiveScreenshot((prev) => (prev === screenshots.length - 1 ? 0 : prev + 1));
  };

  return (
    <>
      <div className="space-y-4">
        {/* <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-150 text-blue-750 text-xs font-semibold w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
          Secure Desktop Client
        </div> */}

        {/* Title styling matching desktop welcome headers */}
        <h2 className="text-3xl font-bold tracking-tight">
          Amicus Desktop
        </h2>
        <p className="text-slate-500 text-base max-w-4xl leading-relaxed">
          <strong>Amicus Desktop</strong> is a secure, AI-powered desktop application designed to streamline legal and business workflows. At the heart of the experience is the <strong>Central Working Space</strong>:
        </p>
        <ul className="space-y-3 max-w-4xl mt-2 text-slate-500 text-base leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1.5 shrink-0 text-[10px]">•</span>
            <span>
              <strong>Unified Control Panel:</strong> A single, consolidated interface where you can manage cases, view documents, sync client emails, and configure preferences.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1.5 shrink-0 text-[10px]">•</span>
            <span>
              <strong>Frictionless Navigation:</strong> Access all indexing, search, and correspondence tools in one central place, designed to minimize context switching and keep your workspace clean.
            </span>
          </li>
        </ul>
      </div>

      {/* Call to Actions matching desktop buttons styling */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/download" className="group">
          <div className="bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg px-5 py-2.5 shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer text-sm">
            <span>Download Desktop Installer</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
        <button
          onClick={() => {
            const el = document.getElementById("features-section");
            el?.scrollIntoView({ behavior: "smooth" });
          }}
          className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center shadow-sm"
        >
          Explore Features
        </button>
      </div>

      {/* Screenshot Carousel Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <span>App Preview</span>
        </h3>

        {/* Screenshot Display */}
        <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-100 bg-slate-50 shadow-inner group">
          <img
            src={screenshots[activeScreenshot].src}
            alt={screenshots[activeScreenshot].alt}
            className="w-full h-full object-cover transition-opacity duration-300"
          />
          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
            <span className="text-[10px] font-medium text-white bg-slate-950/60 backdrop-blur-sm px-2 py-1 rounded">
              {screenshots[activeScreenshot].alt}
            </span>
          </div>
        </div>

        {/* Carousel Controls */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevScreenshot}
            className="w-7 h-7 rounded border border-slate-200 hover:border-slate-300 bg-slate-50 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all cursor-pointer text-xs"
          >
            &larr;
          </button>
          <div className="flex gap-1.5">
            {screenshots.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveScreenshot(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${activeScreenshot === i ? "bg-blue-600 w-3" : "bg-slate-300"
                  }`}
              />
            ))}
          </div>
          <button
            onClick={handleNextScreenshot}
            className="w-7 h-7 rounded border border-slate-200 hover:border-slate-300 bg-slate-50 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all cursor-pointer text-xs"
          >
            &rarr;
          </button>
        </div>
      </div>
    </>
  );
}