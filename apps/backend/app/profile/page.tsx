"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, CircleAlert, Loader2 } from "lucide-react";
import MainTopBar from "@/components/main/MainTopBar";
import ConfirmDialog from "@/components/ConfirmDialog";
import ProfilePreferences from "@/components/ProfilePreferences";
import { useLanguage } from "../../context/LanguageContext";

interface Profile {
  name: string | null;
  email: string;
  emailVerified: string | null;
  tier: "free" | "pro";
  createdAt: string;
}

export default function ProfilePage() {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [confirmDowngradeOpen, setConfirmDowngradeOpen] = useState(false);

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
    await signOut({ callbackUrl: "/login" });
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
    setConfirmDowngradeOpen(false);
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
          <Link href="/" className="p-2 hover:bg-slate-200 rounded-full transition-colors" title={t("profile_back_title")}>
            <ArrowLeft className="size-5 text-slate-600 rtl:scale-x-[-1]" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">{t("profile_title")}</h1>
            <p className="text-sm text-slate-500">{t("profile_subtitle")}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm">{t("profile_loading")}</span>
          </div>
        ) : !profile ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
            {t("profile_load_error")}{" "}
            <Link href="/login" className="text-teal-700 underline">
              {t("profile_load_error_signin")}
            </Link>{" "}
            {t("profile_load_error_again")}
          </div>
        ) : (
          <>
            {/* Account details */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">{t("profile_account")}</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">{t("profile_full_name")}</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">{profile.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">{t("profile_email")}</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                    {profile.email}
                    {profile.emailVerified ? (
                      <BadgeCheck className="size-4 text-emerald-600" aria-label={t("profile_verified")}>
                        <title>{t("profile_verified")}</title>
                      </BadgeCheck>
                    ) : (
                      <CircleAlert className="size-4 text-amber-500" aria-label={t("profile_not_verified")}>
                        <title>{t("profile_not_verified")}</title>
                      </CircleAlert>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">{t("profile_member_since")}</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">
                    {new Date(profile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>
            </div>

            {/* Preferences (ASC-157: language + interface font) */}
            <ProfilePreferences />

            {/* Subscription */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">{t("profile_subscription")}</h2>
                <span
                  className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                    isPro ? "bg-teal-950 text-teal-200" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {isPro ? t("tier_pro") : t("tier_free")}
                </span>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {isPro ? t("profile_plan_pro_name") : t("profile_plan_free_name")}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isPro ? t("profile_plan_pro_desc") : t("profile_plan_free_desc")}
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
                    onClick={() => setConfirmDowngradeOpen(true)}
                    disabled={planLoading}
                    className="text-sm font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {planLoading ? t("profile_downgrading") : t("profile_downgrade")}
                  </button>
                ) : (
                  <button
                    onClick={handleUpgrade}
                    disabled={planLoading}
                    className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-md transition-colors text-sm shadow-sm cursor-pointer"
                  >
                    {planLoading ? t("profile_upgrading") : t("profile_upgrade")}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmDowngradeOpen}
        title={t("profile_downgrade_confirm_title")}
        message={t("profile_downgrade_confirm_message")}
        confirmLabel={t("profile_downgrade")}
        danger
        onConfirm={handleDowngrade}
        onCancel={() => setConfirmDowngradeOpen(false)}
      />
    </div>
  );
}
