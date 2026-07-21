"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, CircleAlert, Loader2 } from "lucide-react";
import MainTopBar from "@/components/main/MainTopBar";

interface Profile {
  name: string | null;
  email: string;
  emailVerified: string | null;
  tier: "free" | "pro";
  createdAt: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");

  async function loadProfile() {
    try {
      const res = await fetch("/api/v1/auth/profile");
      if (res.ok) {
        setProfile(await res.json());
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" });
  };

  async function handleUpgrade() {
    setPlanError("");
    setPlanLoading(true);
    try {
      const res = await fetch("/api/v1/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start checkout");
      // checkoutUrl may be relative (mock provider) or an absolute external
      // URL (a real provider's hosted checkout page) -- a full navigation
      // handles both, unlike router.push which only works for the former.
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setPlanError(err.message || "Something went wrong");
      setPlanLoading(false);
    }
  }

  async function handleDowngrade() {
    if (!confirm("Switch back to the Free plan? You'll lose Pro features (AI, voice input, email sync) immediately.")) {
      return;
    }
    setPlanError("");
    setPlanLoading(true);
    try {
      const res = await fetch("/api/v1/auth/select-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "free" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change plan");
      await loadProfile();
    } catch (err: any) {
      setPlanError(err.message || "Something went wrong");
    } finally {
      setPlanLoading(false);
    }
  }

  const isPro = profile?.tier === "pro";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <MainTopBar
        userName={profile ? profile.name || profile.email : null}
        tier={profile?.tier}
        handleLogout={handleLogout}
      />

      <main className="flex-grow w-full max-w-3xl mx-auto px-6 py-10 flex flex-col gap-8">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
          <Link href="/" className="p-2 hover:bg-slate-200 rounded-full transition-colors" title="Back to Portal">
            <ArrowLeft className="size-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Your Profile</h1>
            <p className="text-sm text-slate-500">Account details and subscription.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm">Loading profile...</span>
          </div>
        ) : !profile ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
            Couldn't load your profile. Try refreshing, or{" "}
            <Link href="/login" className="text-teal-700 underline">
              sign in
            </Link>{" "}
            again.
          </div>
        ) : (
          <>
            {/* Account details */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">Account</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Full name</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">{profile.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Email address</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                    {profile.email}
                    {profile.emailVerified ? (
                      <BadgeCheck className="size-4 text-emerald-600" aria-label="Verified">
                        <title>Verified</title>
                      </BadgeCheck>
                    ) : (
                      <CircleAlert className="size-4 text-amber-500" aria-label="Not verified">
                        <title>Not verified</title>
                      </CircleAlert>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Member since</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">
                    {new Date(profile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>
            </div>

            {/* Subscription */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">Subscription</h2>
                <span
                  className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                    isPro ? "bg-teal-950 text-teal-200" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {isPro ? "Pro" : "Free"}
                </span>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {isPro ? "Amicus Pro" : "Amicus Free"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isPro
                      ? "AI features, voice input, and email sync are enabled."
                      : "Case management, document search, and templates -- no AI, voice, or email sync."}
                  </p>
                </div>
                <span className="text-lg font-bold text-slate-800">
                  {isPro ? "$49" : "$0"}
                  <span className="text-xs font-normal text-slate-400">/mo</span>
                </span>
              </div>

              {planError && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
                  {planError}
                </div>
              )}

              <div className="flex justify-end">
                {isPro ? (
                  <button
                    onClick={handleDowngrade}
                    disabled={planLoading}
                    className="text-sm font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {planLoading ? "Updating..." : "Downgrade to Free"}
                  </button>
                ) : (
                  <button
                    onClick={handleUpgrade}
                    disabled={planLoading}
                    className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm shadow-sm cursor-pointer"
                  >
                    {planLoading ? "Starting checkout..." : "Upgrade to Pro"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
