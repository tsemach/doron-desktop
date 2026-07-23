"use client";

import React from "react";
import { Button } from "@workspace/ui";
import { Download, ShieldCheck, Laptop, Apple, ArrowLeft } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import MainTopBar from "@/components/main/MainTopBar";

const FALLBACK_URL = "https://github.com/tsemach/doron-desktop/releases/latest";

export default function DownloadDashboard() {
  const [userName, setUserName] = React.useState<string | null>(null);
  const [tier, setTier] = React.useState<string | null>(null);
  const [windowsUrl, setWindowsUrl] = React.useState<string>(FALLBACK_URL);
  const [macUrl, setMacUrl] = React.useState<string>(FALLBACK_URL);
  const [linuxUrl, setLinuxUrl] = React.useState<string | null>(null);
  const [detectedOs, setDetectedOs] = React.useState<"Windows" | "macOS" | "Linux">("Windows");

  React.useEffect(() => {
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

  React.useEffect(() => {
    // Detect OS on client mount, just to highlight the relevant button
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (userAgent.includes("mac")) {
      setDetectedOs("macOS");
    } else if (userAgent.includes("linux")) {
      setDetectedOs("Linux");
    }

    // Fetch latest release info from GitHub and resolve a URL per platform
    fetch("https://api.github.com/repos/tsemach/doron-desktop/releases/latest")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch latest release metadata");
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.assets)) {
          const windowsAsset = data.assets.find((a: any) => a.name.endsWith(".exe"));
          const macAsset = data.assets.find(
            (a: any) => a.name.endsWith(".dmg") || a.name.endsWith(".app.tar.gz") || a.name.endsWith(".zip")
          );
          const linuxAsset = data.assets.find(
            (a: any) => a.name.endsWith(".AppImage") || a.name.endsWith(".deb")
          );

          setWindowsUrl(windowsAsset?.browser_download_url || data.html_url || FALLBACK_URL);
          setMacUrl(macAsset?.browser_download_url || data.html_url || FALLBACK_URL);
          setLinuxUrl(linuxAsset?.browser_download_url || null);
        }
      })
      .catch((err) => {
        console.error("Failed to resolve dynamic download link:", err);
      });
  }, []);

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      <main className="flex-grow w-full flex items-center justify-center px-6 py-16">
        <div className="relative w-full max-w-lg -translate-y-[20%] bg-card border border-border rounded-2xl shadow-sm p-10 text-center">

          <Link
            href="/"
            className="absolute top-6 left-6 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Branding & Status */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-4">
              <ShieldCheck className="w-7 h-7 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-slate-900">
              Secure Downloads
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Verified standalone installer and build assets
            </p>
          </div>

          {/* Content */}
          <div className="border-t border-b border-border py-6 my-6 text-slate-600 space-y-3">
            <p className="text-sm">
              {userName
                ? "Download the standalone client below."
                : "No account needed to download -- you'll sign in from inside the app."}
            </p>
            <div className="flex items-center justify-center gap-6 text-xs font-semibold text-slate-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-slate-400" />
                Signed Build
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                SHA256 Verified
              </span>
            </div>
          </div>

          {/* Platform Downloads */}
          <div className="grid grid-cols-2 gap-3">
            <a href={windowsUrl}>
              <Button
                variant={detectedOs === "Windows" ? "default" : "outline"}
                className="w-full h-11 gap-2 font-semibold cursor-pointer"
              >
                <Laptop className="w-4 h-4" />
                Windows
              </Button>
            </a>
            <a href={macUrl}>
              <Button
                variant={detectedOs === "macOS" ? "default" : "outline"}
                className="w-full h-11 gap-2 font-semibold cursor-pointer"
              >
                <Apple className="w-4 h-4" />
                macOS
              </Button>
            </a>
          </div>

          {linuxUrl && (
            <a
              href={linuxUrl}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Also available for Linux (.AppImage)
            </a>
          )}

        </div>
      </main>
    </div>
  );
}
