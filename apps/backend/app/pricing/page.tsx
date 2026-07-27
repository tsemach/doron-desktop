"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Check } from "lucide-react";
import MainTopBar from "@/components/main/MainTopBar";

interface Plan {
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    tagline: "Everything you need to get organized.",
    features: [
      "Central Working Space — one dashboard for cases, documents, and search",
      "Case Management & Tracking",
      "Document Indexing (local, non-AI metadata extraction)",
      "Smart Full-Text Search",
      "Document Tags & Notes",
      "Email Correspondence Sync",
      "Local-first storage — your data stays on your disk",
    ],
    cta: "Get Started",
  },
  {
    name: "Pro",
    price: "$49",
    priceSuffix: "/mo",
    tagline: "AI-powered document intelligence.",
    features: [
      "Everything in Free",
      "AI Document Indexing — auto-extracted summaries, dates, and topics",
      "AI Email Support — smart classification and case-matching",
      "AI-assisted search with semantic query expansion",
      "Priority AI processing",
    ],
    cta: "Upgrade to Pro",
    highlighted: true,
  },
  {
    name: "Ultra",
    price: "$149",
    priceSuffix: "/mo",
    tagline: "Advanced litigation intelligence.",
    features: [
      "Everything in Pro",
      "Advanced Case Simulation — model likely outcomes from case data",
      "Trial Evaluation — AI-assisted strength and risk assessment",
      "Predictive case analytics",
      "Dedicated priority support",
    ],
    cta: "Upgrade to Ultra",
  },
  {
    name: "Fixed Quota",
    price: "Pay as you go",
    tagline: "Full AI access, on your terms.",
    features: [
      "Every AI feature unlocked — indexing, email support, and case simulation",
      "No monthly commitment — buy a token quota upfront",
      "Full AI access continues until your quota is used",
      "Ideal for occasional or seasonal AI usage",
    ],
    cta: "Buy Tokens",
  },
];

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

      <main className="flex-grow w-full px-6 py-20">
        <div className="max-w-6xl mx-auto text-center mb-14">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-3">
            Plans for every practice
          </h1>
          <p className="text-slate-400 text-base max-w-2xl mx-auto">
            Start free, upgrade for AI-powered case intelligence, or pay only for the AI you use.
          </p>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 items-stretch">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-2xl border p-6 ${
                plan.highlighted
                  ? "border-blue-500/50 bg-slate-900 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/30"
                  : "border-slate-800 bg-slate-900"
              }`}
            >
              {plan.highlighted && (
                <span className="mb-3 inline-flex w-fit items-center rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-400">
                  Most Popular
                </span>
              )}

              <h2 className="text-lg font-bold text-white">{plan.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>

              <div className="mt-4 mb-6">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                {plan.priceSuffix && <span className="text-sm text-slate-400">{plan.priceSuffix}</span>}
              </div>

              <ul className="flex-1 space-y-3 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href="/register" className="mt-auto">
                <div
                  className={`w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors cursor-pointer ${
                    plan.highlighted
                      ? "bg-white text-slate-900 hover:bg-slate-100"
                      : "border border-slate-700 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {plan.cta}
                </div>
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-500 mt-10">
          You can switch plans anytime from your account.
        </p>
      </main>
    </div>
  );
}
