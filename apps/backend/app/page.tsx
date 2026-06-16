"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import MainTopBar from "@/components/main/MainTopBar";
import MainFeatureList from "@/components/main/MainFeatureList";
import MainHelpCentralWorkingSpace from "@/components/main/MainHelpCentralWorkingSpace";
import MainHelpCaseManagementAndTraking from "@/components/main/MainHelpCaseManagementAndTraking";

export default function Home() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("User");
  const [MainHelpFeatureSelected, setMainHelpFeatureSelected] = useState<string>("central-working-space");

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

  const onFeatureSelect = (featureTitle: string, featureId: string) => {
    console.log(`main: onFeatureSelect: ${featureTitle}, ${featureId}`)
    setMainHelpFeatureSelected(featureId);
  }
    
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">

      <MainTopBar userName={userName} handleLogout={handleLogout} />

      {/* Main Content Area - Split Layout with Desktop App Styling */}
      <main className="flex-grow w-full px-6 py-12 flex flex-col lg:flex-row gap-10 justify-between items-start">
        {/* Left Column: Hero & Product Description (2/3 width) */}
        <div className="lg:w-2/3 max-w-4xl flex flex-col justify-start space-y-6 ml-12">
          {MainHelpFeatureSelected === "central-working-space" && <MainHelpCentralWorkingSpace />}
          {MainHelpFeatureSelected === "case-management-tracking" && <MainHelpCaseManagementAndTraking />}
          {/* {MainHelpFeatureSelected === "ai-document-indexing" && <MainHelpDocumentIndexing />}
          {MainHelpFeatureSelected === "smart-full-text-search" && <MainHelpFullTextSearch />}
          {MainHelpFeatureSelected === "document-tags-notes" && <MainHelpDocumentTagsAndNotes />}
          {MainHelpFeatureSelected === "email-correspondences-sync" && <MainHelpEmailCorrespondencesSync />} */}
        </div>

        {/* Right Column: Features Highlight & Screenshot Carousel (1/3 width) */}
        <div className="lg:w-1/3 flex flex-col justify-start lg:pt-12 gap-6" id="features-section">
          {/* Features Highlight Card */}
          <MainFeatureList onFeatureSelect={onFeatureSelect} />
        </div>
      </main>

    </div>
  );
}
