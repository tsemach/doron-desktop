import { useAtomValue } from "jotai";
import { User, Check, Type } from "lucide-react";
import { sessionAtom } from "@/store/authStore";
import { Language, TranslationKey } from "../../locales/translations";
import { AppFont, FONT_OPTIONS, buildFontStack } from "../../context/FontContext";

interface SettingPreferencesProps {
  tempLang: Language;
  setTempLang: (val: Language) => void;
  tempFont: AppFont;
  setTempFont: (val: AppFont) => void;
  onSave: () => void;
  saved: boolean;
  setSaved: (val: boolean) => void;
  t: (key: TranslationKey) => string;
}

export default function SettingPreferences({
  tempLang,
  setTempLang,
  tempFont,
  setTempFont,
  onSave,
  saved,
  setSaved,
  t,
}: SettingPreferencesProps) {
  const session = useAtomValue(sessionAtom);

  return (
    <div className="bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6 w-full animate-fade-in">
      {/* User Name -- ASC-143: read-only, sourced from the backend account
          (session.name), not a local setting. There's no self-service way
          to change your own name yet; this just displays it. */}
      <div className="space-y-2">
        <label className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5">
          <User className="size-4 text-foreground" />
          {t("user_name")}
        </label>
        <div className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-input bg-muted/30 text-sm text-foreground">
          {session?.name || session?.email || "—"}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("username_desc")}
        </p>
      </div>

      {/* Separator line */}
      <div className="border-t border-border/60 my-6"></div>

      {/* Language Preference Section */}
      <div className="space-y-2">
        <label className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5" htmlFor="language-select">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-foreground">
            <path d="m5 8 6 6" />
            <path d="m4 14 6-6 2-3" />
            <path d="M2 5h12" />
            <path d="M7 2h1" />
            <path d="m22 22-5-10-5 10" />
            <path d="M14 18h6" />
          </svg>
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
            className="w-full pl-4 pr-10 rtl:pr-4 rtl:pl-10 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none"
          >
            <option value="en">{t("english")}</option>
            <option value="he">{t("hebrew")}</option>
          </select>
          {/* Custom arrow down */}
          <div className="absolute inset-y-0 right-3 rtl:left-3 rtl:right-auto flex items-center pointer-events-none text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {tempLang === "he" ? "שפת ממשק המערכת תוגדר לעברית בכיוון ימין לשמאל." : "System user interface language will be set to English."}
        </p>
      </div>

      {/* Separator line */}
      <div className="border-t border-border/60 my-6"></div>

      {/* Interface Font Section */}
      <div className="space-y-2">
        <label className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5" htmlFor="font-select">
          <Type className="size-4 text-foreground" />
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
            className="w-full pl-4 pr-10 rtl:pr-4 rtl:pl-10 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} — {f.note}
              </option>
            ))}
          </select>
          {/* Custom arrow down */}
          <div className="absolute inset-y-0 right-3 rtl:left-3 rtl:right-auto flex items-center pointer-events-none text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>

        {/* Live preview — mixed Hebrew/Latin, since balancing the two scripts is
            the whole reason this setting exists. */}
        <div
          className="mt-3 rounded-xl border border-border/70 bg-background/60 px-4 py-3.5 space-y-1"
          style={{ fontFamily: buildFontStack(tempFont) }}
        >
          <div className="text-lg font-bold leading-snug">Case Management &nbsp;·&nbsp; ניהול תיקים</div>
          <div className="text-sm font-semibold">תביעה בגין רשלנות &nbsp;·&nbsp; בדיקת אינטגרציה</div>
          <div className="text-xs text-muted-foreground">Tsemach Mizracho &nbsp;·&nbsp; משה ישראלי &nbsp;·&nbsp; לשכת רישום המקרקעין</div>
        </div>

        <p className="text-xs text-muted-foreground">{t("interface_font_desc")}</p>
      </div>

      {/* Separator line */}
      <div className="border-t border-border/60 my-6"></div>

      {/* Save Button */}
      <div className="pt-4">
        <button
          onClick={onSave}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer shadow-md ${
            saved
              ? "bg-emerald-600 text-white shadow-emerald-500/10 hover:bg-emerald-700 animate-pulse"
              : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-neutral-950/10 dark:shadow-none"
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
