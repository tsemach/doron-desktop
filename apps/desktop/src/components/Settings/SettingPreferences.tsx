import { User, Check } from "lucide-react";
import { Language, TranslationKey } from "../../locales/translations";

interface SettingPreferencesProps {
  username: string;
  setUsername: (val: string) => void;
  tempLang: Language;
  setTempLang: (val: Language) => void;
  onSave: () => void;
  saved: boolean;
  setSaved: (val: boolean) => void;
  t: (key: TranslationKey) => string;
}

export default function SettingPreferences({
  username,
  setUsername,
  tempLang,
  setTempLang,
  onSave,
  saved,
  setSaved,
  t,
}: SettingPreferencesProps) {
  return (
    <div className="bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6 w-full animate-fade-in">
      {/* User Name Preference */}
      <div className="space-y-2">
        <label className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5" htmlFor="username">
          <User className="size-4 text-foreground" />
          {t("user_name")}
        </label>
        <div className="relative">
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setSaved(false);
            }}
            placeholder={t("enter_name")}
            className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
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

      {/* Save Button */}
      <div className="pt-4">
        <button
          onClick={onSave}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer shadow-md ${
            saved
              ? "bg-emerald-600 text-white shadow-emerald-500/10 hover:bg-emerald-700 animate-pulse"
              : "bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black shadow-neutral-950/10 dark:shadow-none"
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
