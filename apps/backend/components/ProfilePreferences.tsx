"use client";

import { useState } from "react";
import { Check, Type } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useFont, FONT_OPTIONS, buildFontStack } from "../context/FontContext";
import type { Language } from "../locales/translations";
import type { AppFont } from "../context/FontContext";

// ASC-157 -- ports apps/desktop/src/components/Settings/SettingPreferences.tsx's
// language + font UI (temp state, explicit Save, live bilingual preview) onto
// the web profile page. The desktop panel also shows a read-only "User Name"
// field -- dropped here since the profile page's own Account card already
// shows Full name, and duplicating it would just be redundant UI.
export default function ProfilePreferences() {
  const { language, setLanguage, t } = useLanguage();
  const { font, setFont } = useFont();

  const [tempLang, setTempLang] = useState<Language>(language);
  const [tempFont, setTempFont] = useState<AppFont>(font);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function onSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: tempLang, interfaceFont: tempFont }),
      });
      if (!res.ok) throw new Error();

      setLanguage(tempLang);
      setFont(tempFont);
      setSaved(true);
    } catch {
      setError(t("preferences_save_error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">{t("profile_preferences")}</h2>

      {/* Language */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5" htmlFor="language-select">
          {t("language")}
        </label>
        <div className="relative">
          <select
            id="language-select"
            value={tempLang}
            onChange={(e) => {
              setTempLang(e.target.value as Language);
              setSaved(false);
            }}
            className="w-full pl-4 pr-10 rtl:pr-4 rtl:pl-10 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all cursor-pointer appearance-none"
          >
            <option value="en">{t("english")}</option>
            <option value="he">{t("hebrew")}</option>
          </select>
          <div className="absolute inset-y-0 right-3 rtl:left-3 rtl:right-auto flex items-center pointer-events-none text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {tempLang === "he" ? "שפת ממשק המערכת תוגדר לעברית בכיוון ימין לשמאל." : "System user interface language will be set to English."}
        </p>
      </div>

      {/* Interface font */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5" htmlFor="font-select">
          <Type className="size-4" />
          {t("interface_font")}
        </label>
        <div className="relative">
          <select
            id="font-select"
            value={tempFont}
            onChange={(e) => {
              setTempFont(e.target.value as AppFont);
              setSaved(false);
            }}
            className="w-full pl-4 pr-10 rtl:pr-4 rtl:pl-10 py-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all cursor-pointer appearance-none"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} — {f.note}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-3 rtl:left-3 rtl:right-auto flex items-center pointer-events-none text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>

        <div
          className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 space-y-1"
          style={{ fontFamily: buildFontStack(tempFont) }}
        >
          <div className="text-lg font-bold leading-snug">Case Management &nbsp;·&nbsp; ניהול תיקים</div>
          <div className="text-sm font-semibold">תביעה בגין רשלנות &nbsp;·&nbsp; בדיקת אינטגרציה</div>
          <div className="text-xs text-slate-500">Tsemach Mizrachi &nbsp;·&nbsp; משה ישראלי &nbsp;·&nbsp; לשכת רישום המקרקעין</div>
        </div>

        <p className="text-xs text-slate-500">{t("interface_font_desc")}</p>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">{error}</div>
      )}

      <div className="pt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-md font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 ${
            saved ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-teal-800 hover:bg-teal-900 text-white"
          }`}
        >
          {saved ? (
            <>
              <Check className="size-4" />
              {t("saved")}
            </>
          ) : (
            t("setting_save_preferences")
          )}
        </button>
      </div>
    </div>
  );
}
