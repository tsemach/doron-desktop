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
  ListChecks,
  Users,
} from "lucide-react";
import MainTopBar from "@/components/main/MainTopBar";
import HeroSection from "@/components/marketing/HeroSection";
import CtaBanner from "@/components/marketing/CtaBanner";

// The full feature deep-dive lives at /resources/key-features
// (see app/resources/key-features/page.tsx) -- this page is the
// marketing-facing landing view that introduces Ascurix and links there.

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
    },
    {
      icon: FolderKanban,
      title: "Case Management & Tracking",
      desc: "Organize every matter, client, and status without spreadsheets.",
    },
    {
      icon: Sparkles,
      title: "AI Document Indexing",
      desc: "Auto-extract titles, summaries, and topics from Word, PDF, and Excel files.",
    },
    {
      icon: Search,
      title: "Smart Full-Text Search",
      desc: "Find any clause, name, or figure across your entire archive in milliseconds.",
    },
    {
      icon: Tags,
      title: "Document Tags & Notes",
      desc: "Annotate and flag files so nothing important gets buried.",
    },
    {
      icon: Mail,
      title: "Email Correspondence Sync",
      desc: "IMAP sync matches incoming mail and attachments to the right case automatically.",
    },
    {
      icon: ListChecks,
      title: "Task Management",
      desc: "Templated checklists auto-generate case tasks, tracked on a cross-case dashboard.",
    },
    {
      icon: Users,
      title: "Teams & Roles",
      desc: "Invite your firm, organize teams, and control access with role-based permissions.",
    },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      <main className="flex-grow w-full">
        {/* Hero */}
        <HeroSection
          kicker="For Attorneys & Legal Teams"
          title="Ascurix"
          subtitle="The local-first workspace built for attorneys — cases, documents, and correspondence in one place, indexed, searchable, and secured on your own machine. Stop hunting through folders and inboxes; start working from a single source of truth."
          decoration={
            <span
              aria-hidden
              className="font-display pointer-events-none select-none absolute -right-24 top-1/2 -translate-y-1/2 text-[34rem] leading-none text-slate-900/[0.03] hidden md:block"
            >
              §
            </span>
          }
        >
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/download" className="group">
              <div className="bg-brand-accent hover:brightness-110 text-brand-accent-foreground font-semibold rounded-lg px-7 py-3.5 shadow-md flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer text-sm hover:shadow-lg">
                <span>Download Desktop Installer</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
            <Link href="/resources/key-features">
              <div className="px-7 py-3.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center shadow-sm hover:border-slate-400">
                Explore Key Features
              </div>
            </Link>
          </div>
        </HeroSection>

        {/* Why Ascurix */}
        <section className="w-full bg-slate-50 border-y border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-6 rounded-xl border border-slate-200 bg-white">
                <div className="w-10 h-10 rounded-lg bg-brand-accent/10 border border-brand-accent/20 text-brand-accent flex items-center justify-center mb-3">
                  <Zap className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-900 text-base mb-1.5">Work Faster</h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  AI-powered indexing and instant full-text search replace hours of manual document
                  hunting with results in seconds.
                </p>
              </div>
              <div className="p-6 rounded-xl border border-slate-200 bg-white">
                <div className="w-10 h-10 rounded-lg bg-brand-accent/10 border border-brand-accent/20 text-brand-accent flex items-center justify-center mb-3">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-900 text-base mb-1.5">Stay in Control</h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Local-first storage keeps case files and client data on your own disk, never a
                  third-party cloud.
                </p>
              </div>
              <div className="p-6 rounded-xl border border-slate-200 bg-white">
                <div className="w-10 h-10 rounded-lg bg-brand-accent/10 border border-brand-accent/20 text-brand-accent flex items-center justify-center mb-3">
                  <Scale className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-900 text-base mb-1.5">Built for the Practice of Law</h4>
                <p className="text-sm text-slate-500 leading-relaxed">
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
            <h2 className="font-display text-3xl font-semibold text-slate-900 mb-2">
              Everything you need, in one workspace
            </h2>
            <p className="text-sm text-slate-500 mb-8">
              A quick look at what Ascurix handles for you every day.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="p-6 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-brand-accent/10 border border-brand-accent/20 text-brand-accent flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-base mb-1.5">{title}</h4>
                  <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <Link
                href="/resources/key-features"
                className="text-sm font-semibold text-brand-accent hover:brightness-90 inline-flex items-center gap-1"
              >
                See every feature in detail
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="w-full px-6 pb-20">
          <div className="max-w-6xl mx-auto">
            <CtaBanner
              title="Ready to work from one source of truth?"
              subtitle="Download the desktop app and get your first case indexed in minutes."
              primaryHref="/download"
              primaryLabel="Download Desktop Installer"
              secondaryHref="/pricing"
              secondaryLabel="View Pricing"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
