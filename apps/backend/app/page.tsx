"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import MainTopBar from "@/components/main/MainTopBar";
import MainFeatureList from "@/components/main/MainFeatureList";
import MainHelpCentralWorkingSpace from "@/components/main/MainHelpCentralWorkingSpace";
import MainHelpCaseManagementAndTraking from "@/components/main/MainHelpCaseManagementAndTraking";
import MainHelpDocumentIndexing from "@/components/main/MainHelpDocumentIndexing";
import MainHelpFullTextSearch from "@/components/main/MainHelpFullTextSearch";
import MainHelpDocumentTagsAndNotes from "@/components/main/MainHelpDocumentTagsAndNotes";
import MainHelpEmailCorrespondencesSync from "@/components/main/MainHelpEmailCorrespondencesSync";

export default function Home() {
  const router = useRouter();
  // null = not signed in (the portal is public now, so this is a normal,
  // common state -- not just a loading placeholder).
  const [userName, setUserName] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [MainHelpFeatureSelected, setMainHelpFeatureSelected] = useState<string>("central-working-space");

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" });
  };

  // Fetch current session info on mount
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          if (session?.user?.name || session?.user?.email) {
            setUserName(session.user.name || session.user.email);
            setTier(session.user.tier || "free");
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

      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      {/* Main Content Area - Split Layout with Desktop App Styling */}
      <main className="flex-grow w-full px-6 py-12 flex flex-col lg:flex-row gap-10 justify-between items-start">
        {/* Left Column: Hero & Product Description (2/3 width) */}
        <div className="lg:w-2/3 max-w-4xl flex flex-col justify-start space-y-6 ml-12">
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 w-fit"
          >
            <FileText className="w-4 h-4" />
            Templates
          </Link>

          {MainHelpFeatureSelected === "central-working-space" && <MainHelpCentralWorkingSpace />}
          {MainHelpFeatureSelected === "case-management-tracking" && <MainHelpCaseManagementAndTraking />}
          {MainHelpFeatureSelected === "ai-document-indexing" && <MainHelpDocumentIndexing />}
          {MainHelpFeatureSelected === "smart-full-text-search" && <MainHelpFullTextSearch />}
          {MainHelpFeatureSelected === "document-tags-notes" && <MainHelpDocumentTagsAndNotes />}
          {MainHelpFeatureSelected === "email-correspondences-sync" && <MainHelpEmailCorrespondencesSync />}
        </div>

        {/* Right Column: Features Highlight & Screenshot Carousel (1/3 width) */}
        <div className="lg:w-1/3 flex flex-col justify-start lg:pt-12 gap-6" id="features-section">
          {/* Features Highlight Card */}
          <MainFeatureList activeFeatureId={MainHelpFeatureSelected} onFeatureSelect={onFeatureSelect} />
        </div>
      </main>

    </div>
  );
}
