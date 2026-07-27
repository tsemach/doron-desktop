"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import MainTopBar from "@/components/main/MainTopBar";

export default function PricingPage() {
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
    <div className="dark min-h-screen flex flex-col bg-slate-950 text-slate-50 font-sans">
      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      <main className="flex-grow w-full flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
          Pricing
        </h1>
        <p className="text-slate-400 text-base max-w-lg mb-8">
          Pricing plans are coming soon. Check back shortly for details on Free, Pro, and Ultra tiers.
        </p>
        <Link
          href="/"
          className="text-sm font-semibold text-slate-300 hover:text-white"
        >
          Back to home
        </Link>
      </main>
    </div>
  );
}
