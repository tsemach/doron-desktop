"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import MainTopBar from "@/components/main/MainTopBar";
import HeroSection from "@/components/marketing/HeroSection";
import PillTabs, { type PillTab } from "@/components/marketing/PillTabs";
import KeyFeatureCentralWorkingSpace from "@/components/resources/key-features/KeyFeatureCentralWorkingSpace";
import KeyFeatureCaseManagementAndTraking from "@/components/resources/key-features/KeyFeatureCaseManagementAndTraking";
import KeyFeatureDocumentIndexing from "@/components/resources/key-features/KeyFeatureDocumentIndexing";
import KeyFeatureFullTextSearch from "@/components/resources/key-features/KeyFeatureFullTextSearch";
import KeyFeatureDocumentTagsAndNotes from "@/components/resources/key-features/KeyFeatureDocumentTagsAndNotes";
import KeyFeatureEmailCorrespondencesSync from "@/components/resources/key-features/KeyFeatureEmailCorrespondencesSync";
import KeyFeatureTaskManagement from "@/components/resources/key-features/KeyFeatureTaskManagement";
import KeyFeatureTeamsAndRoles from "@/components/resources/key-features/KeyFeatureTeamsAndRoles";

// Moved from apps/backend/app/page.tsx to apps/backend/app/home/page.tsx --
// this was the entire home page's content; "/" itself has no page component
// of its own anymore, it's pure middleware routing (redirect to /app when
// logged in, rewrite to /home otherwise -- see middlewareLogic.ts).
const FEATURE_TABS: PillTab[] = [
  { id: "central-working-space", label: "Working Space" },
  { id: "case-management-tracking", label: "Case Management" },
  { id: "ai-document-indexing", label: "AI Indexing" },
  { id: "smart-full-text-search", label: "Full-Text Search" },
  { id: "document-tags-notes", label: "Tags & Notes" },
  { id: "email-correspondences-sync", label: "Email Sync" },
  { id: "task-management", label: "Task Management" },
  { id: "teams-and-roles", label: "Teams & Roles" },
];

export default function KeyFeaturesPage() {
  const [userName, setUserName] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [featureSelected, setFeatureSelected] = useState<string>("central-working-space");

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

  const onFeatureSelect = (featureId: string) => {
    setFeatureSelected(featureId);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      <HeroSection
        kicker="Features"
        title="Everything you need, in one workspace"
        subtitle="A closer look at what Ascurix Desktop handles for you every day."
      />

      <main className="flex-grow w-full px-6 pb-16">
        <div className="max-w-5xl mx-auto space-y-10">
          <PillTabs tabs={FEATURE_TABS} activeId={featureSelected} onSelect={onFeatureSelect} />

          {featureSelected === "central-working-space" && <KeyFeatureCentralWorkingSpace />}
          {featureSelected === "case-management-tracking" && <KeyFeatureCaseManagementAndTraking />}
          {featureSelected === "ai-document-indexing" && <KeyFeatureDocumentIndexing />}
          {featureSelected === "smart-full-text-search" && <KeyFeatureFullTextSearch />}
          {featureSelected === "document-tags-notes" && <KeyFeatureDocumentTagsAndNotes />}
          {featureSelected === "email-correspondences-sync" && <KeyFeatureEmailCorrespondencesSync />}
          {featureSelected === "task-management" && <KeyFeatureTaskManagement />}
          {featureSelected === "teams-and-roles" && <KeyFeatureTeamsAndRoles />}
        </div>
      </main>
    </div>
  );
}
