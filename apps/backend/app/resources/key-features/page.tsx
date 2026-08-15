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
import { useLanguage } from "../../../context/LanguageContext";
import type { TranslationKey } from "../../../locales/translations";

// Moved from apps/backend/app/page.tsx to apps/backend/app/home/page.tsx --
// this was the entire home page's content; "/" itself has no page component
// of its own anymore, it's pure middleware routing (redirect to /app when
// logged in, rewrite to /home otherwise -- see middlewareLogic.ts).
const FEATURE_TABS: { id: string; labelKey: TranslationKey }[] = [
  { id: "central-working-space", labelKey: "kf_tab_working_space" },
  { id: "case-management-tracking", labelKey: "kf_tab_case_management" },
  { id: "ai-document-indexing", labelKey: "kf_tab_ai_indexing" },
  { id: "smart-full-text-search", labelKey: "kf_tab_full_text_search" },
  { id: "document-tags-notes", labelKey: "kf_tab_tags_notes" },
  { id: "email-correspondences-sync", labelKey: "kf_tab_email_sync" },
  { id: "task-management", labelKey: "kf_tab_task_management" },
  { id: "teams-and-roles", labelKey: "kf_tab_teams_roles" },
];

export default function KeyFeaturesPage() {
  const { t } = useLanguage();
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

  const featureTabs: PillTab[] = FEATURE_TABS.map(({ id, labelKey }) => ({ id, label: t(labelKey) }));

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      <HeroSection
        kicker={t("key_features_kicker")}
        title={t("home_features_title")}
        subtitle={t("key_features_subtitle")}
      />

      <main className="flex-grow w-full px-6 pb-16">
        <div className="max-w-5xl mx-auto space-y-10">
          <PillTabs tabs={featureTabs} activeId={featureSelected} onSelect={onFeatureSelect} />

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
