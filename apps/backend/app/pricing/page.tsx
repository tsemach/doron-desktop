"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Check } from "lucide-react";
import MainTopBar from "@/components/main/MainTopBar";
import CtaBanner from "@/components/marketing/CtaBanner";
import { useLanguage } from "../../context/LanguageContext";
import type { TranslationKey } from "../../locales/translations";

interface Plan {
  nameKey: TranslationKey;
  price?: string;
  priceKey?: TranslationKey;
  priceSuffix?: string;
  taglineKey: TranslationKey;
  featureKeys: TranslationKey[];
  ctaKey: TranslationKey;
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    nameKey: "tier_free",
    price: "$0",
    taglineKey: "plan_free_tagline",
    featureKeys: [
      "pricing_free_feature_1",
      "pricing_free_feature_2",
      "pricing_free_feature_3",
      "pricing_free_feature_4",
      "pricing_free_feature_5",
      "pricing_free_feature_6",
      "pricing_free_feature_7",
    ],
    ctaKey: "plan_free_cta",
  },
  {
    nameKey: "tier_pro",
    price: "$49",
    priceSuffix: "/mo",
    taglineKey: "plan_pro_tagline",
    featureKeys: [
      "pricing_pro_feature_1",
      "pricing_pro_feature_2",
      "pricing_pro_feature_3",
      "pricing_pro_feature_4",
      "pricing_pro_feature_5",
    ],
    ctaKey: "plan_pro_cta",
    highlighted: true,
  },
  {
    nameKey: "tier_ultra",
    price: "$149",
    priceSuffix: "/mo",
    taglineKey: "plan_ultra_tagline",
    featureKeys: [
      "pricing_ultra_feature_1",
      "pricing_ultra_feature_2",
      "pricing_ultra_feature_3",
      "pricing_ultra_feature_4",
      "pricing_ultra_feature_5",
    ],
    ctaKey: "plan_ultra_cta",
  },
  {
    nameKey: "plan_fixed_name",
    priceKey: "plan_fixed_price",
    taglineKey: "plan_fixed_tagline",
    featureKeys: [
      "pricing_fixed_feature_1",
      "pricing_fixed_feature_2",
      "pricing_fixed_feature_3",
      "pricing_fixed_feature_4",
    ],
    ctaKey: "plan_fixed_cta",
  },
];

export default function PricingPage() {
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

      <main className="flex-grow w-full px-6 py-20">
        <div className="max-w-6xl mx-auto text-center mb-14">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 mb-3">
            {t("pricing_title")}
          </h1>
          <p className="text-slate-500 text-base max-w-2xl mx-auto">{t("pricing_subtitle")}</p>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {PLANS.map((plan) => (
            <div
              key={plan.nameKey}
              className={`flex flex-col rounded-2xl border p-6 ${
                plan.highlighted
                  ? "border-brand-accent/50 bg-white shadow-lg shadow-brand-accent/10 ring-1 ring-brand-accent/30"
                  : "border-slate-200 bg-white"
              }`}
            >
              {plan.highlighted && (
                <span className="mb-3 inline-flex w-fit items-center rounded-full bg-brand-accent/10 border border-brand-accent/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-accent">
                  {t("pricing_most_popular")}
                </span>
              )}

              <h2 className="text-lg font-bold text-slate-900">{t(plan.nameKey)}</h2>
              <p className="mt-1 text-sm text-slate-500">{t(plan.taglineKey)}</p>

              <div className="mt-4 mb-6">
                <span className="text-3xl font-bold text-slate-900">{plan.priceKey ? t(plan.priceKey) : plan.price}</span>
                {plan.priceSuffix && <span className="text-sm text-slate-500">{plan.priceSuffix}</span>}
              </div>

              <ul className="flex-1 space-y-3 mb-6">
                {plan.featureKeys.map((featureKey) => (
                  <li key={featureKey} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-brand-accent" />
                    <span>{t(featureKey)}</span>
                  </li>
                ))}
              </ul>

              <Link href="/register" className="mt-auto">
                <div
                  className={`w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors cursor-pointer ${
                    plan.highlighted
                      ? "bg-brand-accent text-brand-accent-foreground hover:brightness-110"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {t(plan.ctaKey)}
                </div>
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-500 mt-10 mb-16">{t("pricing_switch_note")}</p>

        <div className="max-w-6xl mx-auto">
          <CtaBanner
            title={t("pricing_cta_title")}
            subtitle={t("pricing_cta_subtitle")}
            primaryHref="/register"
            primaryLabel={t("pricing_cta_primary")}
            secondaryHref="/resources/key-features"
            secondaryLabel={t("pricing_cta_secondary")}
          />
        </div>
      </main>
    </div>
  );
}
