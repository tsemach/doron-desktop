"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workspace/ui";
import { Download, LogOut, ShieldCheck, ArrowLeft } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";

export default function DownloadDashboard() {
  const router = useRouter();
  const [downloadUrl, setDownloadUrl] = React.useState<string>(
    "https://github.com/tsemach/doron-desktop/releases/latest"
  );
  const [os, setOs] = React.useState<string>("Windows");

  React.useEffect(() => {
    // Detect OS on client mount
    const userAgent = window.navigator.userAgent.toLowerCase();
    let detectedOs = "Windows";
    if (userAgent.includes("mac")) {
      detectedOs = "macOS";
    } else if (userAgent.includes("linux")) {
      detectedOs = "Linux";
    }
    setOs(detectedOs);

    // Fetch latest release info from GitHub
    fetch("https://api.github.com/repos/tsemach/doron-desktop/releases/latest")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch latest release metadata");
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.assets)) {
          // Match the file extension pattern by OS
          let pattern = ".exe";
          if (detectedOs === "macOS") {
            pattern = ".dmg";
          } else if (detectedOs === "Linux") {
            pattern = ".deb";
          }

          // Locate primary asset
          let asset = data.assets.find((a: any) => a.name.endsWith(pattern));

          // Fallbacks for mac/linux if primary extension is missing
          if (!asset && detectedOs === "macOS") {
            asset = data.assets.find(
              (a: any) => a.name.endsWith(".app.tar.gz") || a.name.endsWith(".zip")
            );
          } else if (!asset && detectedOs === "Linux") {
            asset = data.assets.find((a: any) => a.name.endsWith(".AppImage"));
          }

          if (asset && asset.browser_download_url) {
            setDownloadUrl(asset.browser_download_url);
          } else if (data.html_url) {
            setDownloadUrl(data.html_url);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to resolve dynamic download link:", err);
      });
  }, []);

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Subtle Dynamic Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[8000ms]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-100/50 rounded-full blur-[140px] pointer-events-none animate-pulse duration-[6000ms]"></div>
      <div className="absolute top-[30%] right-[20%] w-[350px] h-[350px] bg-purple-100/30 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Main Glassmorphic Container (Light Theme) */}
      <div className="relative z-10 w-full max-w-lg bg-white/70 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/80 p-10 mx-4 text-center relative transition-all duration-300">
        
        {/* Navigation & Logout Controls */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>

        {/* Branding & Status */}
        <div className="flex flex-col items-center mb-6 mt-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shadow-md shadow-emerald-500/10 mb-4 animate-bounce duration-[3000ms]">
            <ShieldCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
            Secure Downloads
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Verified standalone installer and build assets
          </p>
        </div>

        {/* Content */}
        <div className="border-t border-b border-slate-200/60 py-6 my-6 text-slate-600 space-y-3">
          <p className="text-sm">
            Welcome! Your account session is active. You have authorized access to download the standalone client.
          </p>
          <div className="flex items-center justify-center gap-6 text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              Signed Build
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              SHA256 Verified
            </span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-center pt-2">
          <a href={downloadUrl} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-lg transition-all cursor-pointer shadow-md shadow-blue-900/20">
              <Download className="w-5 h-5 animate-pulse" />
              <span>Download Standalone App ({os})</span>
            </Button>
          </a>
        </div>

      </div>
    </div>
  );
}
