"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import MainTopBar from "@/components/main/MainTopBar";
import KeyFeatureFeaturesList from "@/components/resources/key-features/KeyFeatureFeaturesList";
import KeyFeatureCentralWorkingSpace from "@/components/resources/key-features/KeyFeatureCentralWorkingSpace";
import KeyFeatureCaseManagementAndTraking from "@/components/resources/key-features/KeyFeatureCaseManagementAndTraking";
import KeyFeatureDocumentIndexing from "@/components/resources/key-features/KeyFeatureDocumentIndexing";
import KeyFeatureFullTextSearch from "@/components/resources/key-features/KeyFeatureFullTextSearch";
import KeyFeatureDocumentTagsAndNotes from "@/components/resources/key-features/KeyFeatureDocumentTagsAndNotes";
import KeyFeatureEmailCorrespondencesSync from "@/components/resources/key-features/KeyFeatureEmailCorrespondencesSync";

// Moved from apps/backend/app/page.tsx -- this was the entire home page's
// content; "/" itself now just keeps the MainTopBar shell (see app/page.tsx).
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

  const onFeatureSelect = (featureTitle: string, featureId: string) => {
    console.log(`key-features: onFeatureSelect: ${featureTitle}, ${featureId}`);
    setFeatureSelected(featureId);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      {/* Main Content Area - Split Layout with Desktop App Styling */}
      <main className="flex-grow w-full px-6 pt-4 pb-12 flex flex-col lg:flex-row gap-8 items-stretch">
        {/* Left Column: Features List (1/5 width), separated from the main
            view by a vertical divider instead of its own card border */}
        <div
          className="lg:w-1/5 flex flex-col justify-start gap-6 lg:border-r lg:border-slate-200 lg:pr-8"
          id="features-section"
        >
          <KeyFeatureFeaturesList activeFeatureId={featureSelected} onFeatureSelect={onFeatureSelect} />
        </div>

        {/* Right Column: Feature Content (4/5 width) */}
        <div className="lg:w-4/5 max-w-4xl flex flex-col justify-start space-y-6">
          {featureSelected === "central-working-space" && <KeyFeatureCentralWorkingSpace />}
          {featureSelected === "case-management-tracking" && <KeyFeatureCaseManagementAndTraking />}
          {featureSelected === "ai-document-indexing" && <KeyFeatureDocumentIndexing />}
          {featureSelected === "smart-full-text-search" && <KeyFeatureFullTextSearch />}
          {featureSelected === "document-tags-notes" && <KeyFeatureDocumentTagsAndNotes />}
          {featureSelected === "email-correspondences-sync" && <KeyFeatureEmailCorrespondencesSync />}
        </div>
      </main>
    </div>
  );
}
