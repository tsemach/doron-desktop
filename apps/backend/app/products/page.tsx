"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import MainTopBar from "@/components/main/MainTopBar";
import HeroSection from "@/components/marketing/HeroSection";
import { useLanguage } from "../../context/LanguageContext";

export default function ProductsPage() {
  const { t } = useLanguage();
  const [userName, setUserName] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);

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

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      <HeroSection kicker={t("products_title")} title={t("products_title")} subtitle={t("products_subtitle")}>
        <Link href="/" className="text-sm font-semibold text-brand-accent hover:brightness-90">
          {t("back_to_home")}
        </Link>
      </HeroSection>
    </div>
  );
}
