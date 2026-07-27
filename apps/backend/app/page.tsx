"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Scale,
  Layout,
  FolderKanban,
  Sparkles,
  Search,
  Tags,
  Mail,
} from "lucide-react";
import MainTopBar from "@/components/main/MainTopBar";

// The full feature deep-dive lives at /resources/key-features
// (see app/resources/key-features/page.tsx) -- this page is the
// marketing-facing landing view that introduces Ascurix and links there.
// Pinned to dark mode: the `dark` class flips MainTopBar (and anything else
// using the semantic bg-background/text-foreground tokens) via globals.css's
// `.dark { ... }` overrides; everything else here uses hand-picked slate/
// accent values since this page's own markup doesn't use those tokens.

const ACCENT = {
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400" },
  indigo: { bg: "bg-indigo-500/10", border: "border-indigo-500/20", text: "text-indigo-400" },
  teal: { bg: "bg-teal-500/10", border: "border-teal-500/20", text: "text-teal-400" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400" },
  rose: { bg: "bg-rose-500/10", border: "border-rose-500/20", text: "text-rose-400" },
  sky: { bg: "bg-sky-500/10", border: "border-sky-500/20", text: "text-sky-400" },
} as const;

export default function Home() {
  const [userName, setUserName] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

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

  const features = [
    {
      icon: Layout,
      title: "Central Working Space",
      desc: "Cases, documents, search and email in one consolidated dashboard.",
      accent: "blue",
    },
    {
      icon: FolderKanban,
      title: "Case Management & Tracking",
      desc: "Organize every matter, client, and status without spreadsheets.",
      accent: "indigo",
    },
    {
      icon: Sparkles,
      title: "AI Document Indexing",
      desc: "Auto-extract titles, summaries, and topics from Word, PDF, and Excel files.",
      accent: "teal",
    },
    {
      icon: Search,
      title: "Smart Full-Text Search",
      desc: "Find any clause, name, or figure across your entire archive in milliseconds.",
      accent: "amber",
    },
    {
      icon: Tags,
      title: "Document Tags & Notes",
      desc: "Annotate and flag files so nothing important gets buried.",
      accent: "rose",
    },
    {
      icon: Mail,
      title: "Email Correspondence Sync",
      desc: "IMAP sync matches incoming mail and attachments to the right case automatically.",
      accent: "sky",
    },
  ] as const;

  return (
    <div className="dark min-h-screen flex flex-col bg-slate-950 text-slate-50 font-sans">
      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      <main className="flex-grow w-full">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          {/* Signature mark: a section-sign watermark nods to the audience's
              own vocabulary and gives the wide hero band a reason to be
              wide, instead of leaving bare margins either side of the text. */}
          <span
            aria-hidden
            className="font-display pointer-events-none select-none absolute -right-24 top-1/2 -translate-y-1/2 text-[34rem] leading-none text-white/[0.03] hidden md:block"
          >
            §
          </span>

          <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
            <div className="inline-flex items-center gap-3 mb-8">
              <span className="h-px w-8 bg-slate-700" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                For Attorneys &amp; Legal Teams
              </span>
              <span className="h-px w-8 bg-slate-700" aria-hidden />
            </div>

            <h1 className="font-display font-semibold text-7xl sm:text-8xl lg:text-[9rem] tracking-tight text-white leading-none mb-8">
              Ascurix
            </h1>

            <p className="text-slate-400 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-10">
              The local-first workspace built for attorneys — cases, documents, and correspondence
              in one place, indexed, searchable, and secured on your own machine. Stop hunting
              through folders and inboxes; start working from a single source of truth.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/download" className="group">
                <div className="bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-lg px-7 py-3.5 shadow-md flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer text-sm hover:shadow-lg">
                  <span>Download Desktop Installer</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
              <Link href="/resources/key-features">
                <div className="px-7 py-3.5 border border-slate-700 hover:bg-slate-800 text-slate-200 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center shadow-sm hover:border-slate-600">
                  Explore Key Features
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* Why Ascurix */}
        <section className="w-full bg-slate-900/50 border-y border-slate-800">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-900">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-3">
                  <Zap className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-100 text-base mb-1.5">Work Faster</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  AI-powered indexing and instant full-text search replace hours of manual document
                  hunting with results in seconds.
                </p>
              </div>
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-900">
                <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-100 text-base mb-1.5">Stay in Control</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Local-first storage keeps case files and client data on your own disk, never a
                  third-party cloud.
                </p>
              </div>
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-900">
                <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-3">
                  <Scale className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-100 text-base mb-1.5">Built for the Practice of Law</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Matter tracking, templates, and email sync are designed around how attorneys and
                  legal teams actually work.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="w-full">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <h2 className="font-display text-3xl font-semibold text-white mb-2">
              Everything you need, in one workspace
            </h2>
            <p className="text-sm text-slate-400 mb-8">
              A quick look at what Ascurix handles for you every day.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map(({ icon: Icon, title, desc, accent }) => {
                const colors = ACCENT[accent as keyof typeof ACCENT];
                return (
                  <div
                    key={title}
                    className="p-6 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800/60 hover:border-slate-700 transition-all duration-200 shadow-sm"
                  >
                    <div
                      className={`w-10 h-10 rounded-lg ${colors.bg} border ${colors.border} ${colors.text} flex items-center justify-center mb-3`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-slate-100 text-base mb-1.5">{title}</h4>
                    <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
                  </div>
                );
              })}
            </div>
            <div className="text-center mt-10">
              <Link
                href="/resources/key-features"
                className="text-sm font-semibold text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
              >
                See every feature in detail
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
