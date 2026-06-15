"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Download, User, LogOut, Settings, ArrowRight } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import MainTopBar from "@/components/MainTopBar";
import HomePageFeatureList from "./HomePageFeatureList";

export default function Home() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("User");
  
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

  const features = [
    {
      title: "Central Working Space",
      desc: "A single consolidated control panel to manage cases, view documents, sync emails, and configure preferences.",
    },
    {
      title: "Case Management & Tracking",
      desc: "Organize active legal/business cases, record client metadata, and track statuses seamlessly.",
    },
    {
      title: "AI Document Indexing",
      desc: "Auto-extract titles, summaries, dates, and topics from Word, PDF, and Excel files using Claude API.",
    },
    {
      title: "Smart Full-Text Search",
      desc: "Perform lightning-fast, index-wide searches over document texts and metadata attributes.",
    },
    {
      title: "Document Tags & Notes",
      desc: "Annotate cases and files with custom descriptions, flags, and tags to keep folders organized.",
    },
    {
      title: "Email Correspondences Sync",
      desc: "Direct IMAP sync that matches incoming emails and attachments to their corresponding cases.",
    },
  ];

  const handlePrevScreenshot = () => {
    setActiveScreenshot((prev) => (prev === 0 ? screenshots.length - 1 : prev - 1));
  };

  const handleNextScreenshot = () => {
    setActiveScreenshot((prev) => (prev === screenshots.length - 1 ? 0 : prev + 1));
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  // Fetch current session info on mount
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          if (session?.user?.name) {
            setUserName(session.user.name);
          } else if (session?.user?.email) {
            setUserName(session.user.email);
          }
        }
      } catch (err) {
        console.error("Failed to fetch session:", err);
      }
    }
    fetchSession();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      
      <MainTopBar userName={userName} handleLogout={handleLogout} />

      {/* Main Content Area - Split Layout with Desktop App Styling */}
      <main className="flex-grow w-full px-6 py-12 flex flex-col lg:flex-row gap-10 justify-between">
        
        {/* Left Column: Hero & Product Description (2/3 width) */}
        <div className="lg:w-2/3 max-w-4xl flex flex-col justify-start space-y-6 ml-12" >
          <div className="space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-150 text-blue-750 text-xs font-semibold w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
              Secure Desktop Client
            </div>
            
            {/* Title styling matching desktop welcome headers */}
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Doron Case & <br />
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Document Indexer</span>
            </h1>
            <p className="text-slate-500 text-base max-w-4xl leading-relaxed">
              <strong>Doron</strong> is a secure, AI-powered desktop application designed to streamline legal and business workflows. With <strong>Doron</strong>, you can index local directories, perform lightning-fast searches, match email correspondences, and generate rich metadata summaries with Claude AI—all from a single, centralized control panel.
            </p>
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
                    className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                      activeScreenshot === i ? "bg-blue-600 w-3" : "bg-slate-300"
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
        </div>

        {/* Right Column: Features Highlight & Screenshot Carousel (1/3 width) */}
        <div className="lg:w-1/3 flex flex-col justify-start lg:pt-2 gap-6" id="features-section">
          {/* Features Highlight Card */}
          <HomePageFeatureList />
        </div>
      </main>

    </div>
  );
}
