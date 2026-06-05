import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Eye, EyeOff, Check, Settings as SettingsIcon, Mail, Server } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { Language } from "../../locales/translations";
import { invoke } from "@tauri-apps/api/core";

export const API_KEY_STORAGE_KEY = "claude_api_key";
export const USER_NAME_STORAGE_KEY = "user_name";

export default function Settings() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [saved, setSaved] = useState(false);
  const [tempLang, setTempLang] = useState<Language>(language);

  // Email Server & AI Settings States
  const [imapServer, setImapServer] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [emailUsername, setEmailUsername] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [aiProvider, setAiProvider] = useState("claude");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [showProviderKey, setShowProviderKey] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedKey) setApiKey(storedKey);

    const storedName = localStorage.getItem(USER_NAME_STORAGE_KEY);
    if (storedName) setUsername(storedName);

    loadEmailConfig();
  }, []);

  useEffect(() => {
    setTempLang(language);
  }, [language]);

  async function loadEmailConfig() {
    try {
      const res = await invoke<any>("get_email_settings");
      if (res) {
        setImapServer(res.imap_server);
        setImapPort(res.imap_port);
        setEmailUsername(res.username);
        setEmailPassword(res.password_enc);
        setAiProvider(res.provider);
        setProviderApiKey(res.api_key_enc);
      }
    } catch (e) {
      console.error("Failed to load email configurations:", e);
    }
  }

  async function handleSave() {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
    localStorage.setItem(USER_NAME_STORAGE_KEY, username.trim());
    setLanguage(tempLang);

    try {
      await invoke("save_email_settings", {
        config: {
          imap_server: imapServer.trim(),
          imap_port: Number(imapPort),
          username: emailUsername.trim(),
          password_enc: emailPassword.trim(),
          provider: aiProvider,
          api_key_enc: providerApiKey.trim(),
        }
      });
    } catch (e) {
      console.error("Failed to save email settings:", e);
      alert("Failed to save email configurations: " + e);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-start items-start p-8 md:p-12 overflow-y-auto">
      <div className="max-w-xl w-full space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-5 w-full">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="group flex items-center justify-center size-10 rounded-xl border border-border bg-card hover:bg-accent hover:text-foreground transition-all cursor-pointer shadow-sm animate-fade-in"
              title="Go back"
            >
              <ArrowLeft className="size-4 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5 transition-transform" />
            </button>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-500 uppercase tracking-wider">
                <SettingsIcon className="size-3 animate-[spin_4s_linear_infinite]" />
                {t("system_preferences")}
              </div>
              <h1 className="text-2xl font-bold tracking-tight mt-0.5">{t("settings")}</h1>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <div className="bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6 w-full">
          
          {/* User Name Preference */}
          <div className="space-y-2">
            <label className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5" htmlFor="username">
              <User className="size-4 text-blue-500" />
              {t("user_name")}
            </label>
            <div className="relative">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setSaved(false); }}
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-blue-500">
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
                onChange={(e) => { setTempLang(e.target.value as Language); setSaved(false); }}
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

          {/* Email Server Ingestion Configuration */}
          <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 pt-2">
            <Mail className="size-4 text-blue-500" />
            {t("email_integration") || "Email Integration"}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <label className="text-xs font-semibold text-foreground" htmlFor="imap-server">
                IMAP Host
              </label>
              <input
                id="imap-server"
                type="text"
                value={imapServer}
                onChange={(e) => { setImapServer(e.target.value); setSaved(false); }}
                placeholder="imap.mail.com"
                className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <label className="text-xs font-semibold text-foreground" htmlFor="imap-port">
                IMAP Port
              </label>
              <input
                id="imap-port"
                type="number"
                value={imapPort}
                onChange={(e) => { setImapPort(Number(e.target.value)); setSaved(false); }}
                placeholder="993"
                className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="email-username">
              {t("email_username") || "Username (Email)"}
            </label>
            <input
              id="email-username"
              type="email"
              value={emailUsername}
              onChange={(e) => { setEmailUsername(e.target.value); setSaved(false); }}
              placeholder="lawyer@firm.com"
              className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="email-password">
              {t("email_password") || "Password / App Token"}
            </label>
            <div className="relative">
              <input
                id="email-password"
                type={showEmailPassword ? "text" : "password"}
                value={emailPassword}
                onChange={(e) => { setEmailPassword(e.target.value); setSaved(false); }}
                placeholder="••••••••••••"
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="button"
                onClick={() => setShowEmailPassword(!showEmailPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                {showEmailPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* Separator line */}
          <div className="border-t border-border/60 my-6"></div>

          {/* Provider Agnostic AI Model Configuration */}
          <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 pt-2">
            <Server className="size-4 text-amber-500" />
            {t("ai_model_provider") || "AI Model Provider"}
          </h2>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="ai-provider">
              {t("provider") || "Provider"}
            </label>
            <div className="relative">
              <select
                id="ai-provider"
                value={aiProvider}
                onChange={(e) => { setAiProvider(e.target.value); setSaved(false); }}
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer appearance-none"
              >
                <option value="claude">Anthropic Claude</option>
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="provider-api-key">
              {t("provider_api_key") || "Provider API Key"}
            </label>
            <div className="relative">
              <input
                id="provider-api-key"
                type={showProviderKey ? "text" : "password"}
                value={providerApiKey}
                onChange={(e) => { setProviderApiKey(e.target.value); setSaved(false); }}
                placeholder={aiProvider === "claude" ? "sk-ant-..." : aiProvider === "openai" ? "sk-..." : "AIzaSy..."}
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-input bg-background/50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="button"
                onClick={() => setShowProviderKey(!showProviderKey)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                {showProviderKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("provider_key_desc") || "Used to process incoming emails and suggest case matching. Stored locally."}
            </p>
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSave}
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
                t("save_preferences")
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
