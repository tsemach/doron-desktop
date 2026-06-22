import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Settings as SettingsIcon, Mail, Server, RefreshCw } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { Language } from "../../locales/translations";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

import SettingPreferences from "./SettingPreferences";
import SettingEmailIntegration from "./SettingEmailIntegration";
import SettingAiProvider from "./SettingAiProvider";
import SettingSoftwareUpdate from "./SettingSoftwareUpdate";

export const API_KEY_STORAGE_KEY = "claude_api_key";
export const USER_NAME_STORAGE_KEY = "user_name";

type TabType = "preferences" | "email" | "ai" | "update";

export default function Settings() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>("preferences");
  
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

  // Software Update States
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "up-to-date" | "downloading" | "error">("idle");
  const [updaterError, setUpdaterError] = useState("");
  const [availableVersion, setAvailableVersion] = useState("");
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);

  useEffect(() => {
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedKey) setApiKey(storedKey);

    const storedName = localStorage.getItem(USER_NAME_STORAGE_KEY);
    if (storedName) setUsername(storedName);

    loadEmailConfig();

    // Fetch app version
    const fetchVersion = async () => {
      try {
        const v = await getVersion();
        setAppVersion(v);
      } catch (e) {
        console.error("Failed to load app version:", e);
      }
    };
    fetchVersion();
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

  const handleCheckForUpdates = async () => {
    try {
      setUpdateStatus("checking");
      const update = await check();
      if (update) {
        setUpdateStatus("available");
        setAvailableVersion(update.version);
        setPendingUpdate(update);
      } else {
        setUpdateStatus("up-to-date");
      }
    } catch (err: any) {
      console.error("Manual check for updates failed:", err);
      setUpdateStatus("error");
      setUpdaterError(err.message || "Failed to check for updates.");
    }
  };

  const handleInstallManual = async () => {
    if (!pendingUpdate) return;
    try {
      setUpdateStatus("downloading");
      await pendingUpdate.downloadAndInstall();
      await relaunch();
    } catch (err: any) {
      console.error("Manual update install failed:", err);
      setUpdateStatus("error");
      setUpdaterError(err.message || "Failed to install the update.");
    }
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "preferences":
        return (
          <SettingPreferences
            username={username}
            setUsername={setUsername}
            tempLang={tempLang}
            setTempLang={setTempLang}
            onSave={handleSave}
            saved={saved}
            setSaved={setSaved}
            t={t}
          />
        );
      case "email":
        return (
          <SettingEmailIntegration
            imapServer={imapServer}
            setImapServer={setImapServer}
            imapPort={imapPort}
            setImapPort={setImapPort}
            emailUsername={emailUsername}
            setEmailUsername={setEmailUsername}
            emailPassword={emailPassword}
            setEmailPassword={setEmailPassword}
            showEmailPassword={showEmailPassword}
            setShowEmailPassword={setShowEmailPassword}
            onSave={handleSave}
            saved={saved}
            setSaved={setSaved}
            t={t}
          />
        );
      case "ai":
        return <SettingAiProvider />;
      case "update":
        return (
          <SettingSoftwareUpdate
            appVersion={appVersion}
            updateStatus={updateStatus}
            updaterError={updaterError}
            availableVersion={availableVersion}
            onCheckForUpdates={handleCheckForUpdates}
            onInstallManual={handleInstallManual}
            t={t}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-start items-start p-8 md:p-12 overflow-y-auto">
      <div className="max-w-5xl w-full space-y-6 flex flex-col flex-1">
        
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
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
                <SettingsIcon className="size-3 animate-[spin_4s_linear_infinite]" />
                {t("system_preferences")}
              </div>
              <h1 className="text-2xl font-bold tracking-tight mt-0.5">{t("settings")}</h1>
            </div>
          </div>
        </div>

        {/* Main Settings Two-Column Layout */}
        <div className="flex flex-col md:flex-row gap-8 w-full items-stretch mt-4 flex-1">
          
          {/* Left Navigation Menu */}
          <div className="w-full md:w-64 flex flex-col gap-1.5 shrink-0 md:border-r rtl:md:border-r-0 rtl:md:border-l border-border md:pr-6 rtl:md:pl-6 pb-6 md:pb-0 border-b md:border-b-0">
            <button
              onClick={() => setActiveTab("preferences")}
              className={`w-full text-left rtl:text-right px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center gap-2.5 relative ${
                activeTab === "preferences"
                  ? "bg-accent text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {activeTab === "preferences" && (
                <div className="absolute left-0 rtl:left-auto rtl:right-0 top-2.5 bottom-2.5 w-1 bg-foreground rounded-full animate-fade-in" />
              )}
              <User className="size-4 text-foreground" />
              {t("system_preferences")}
            </button>
            
            <button
              onClick={() => setActiveTab("email")}
              className={`w-full text-left rtl:text-right px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center gap-2.5 relative ${
                activeTab === "email"
                  ? "bg-accent text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {activeTab === "email" && (
                <div className="absolute left-0 rtl:left-auto rtl:right-0 top-2.5 bottom-2.5 w-1 bg-foreground rounded-full animate-fade-in" />
              )}
              <Mail className="size-4 text-foreground" />
              {t("email_integration") || "Email Integration"}
            </button>
            
            <button
              onClick={() => setActiveTab("ai")}
              className={`w-full text-left rtl:text-right px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center gap-2.5 relative ${
                activeTab === "ai"
                  ? "bg-accent text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {activeTab === "ai" && (
                <div className="absolute left-0 rtl:left-auto rtl:right-0 top-2.5 bottom-2.5 w-1 bg-foreground rounded-full animate-fade-in" />
              )}
              <Server className="size-4 text-foreground" />
              AI Provider (LLM)
            </button>
            
            <button
              onClick={() => setActiveTab("update")}
              className={`w-full text-left rtl:text-right px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center gap-2.5 relative ${
                activeTab === "update"
                  ? "bg-accent text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {activeTab === "update" && (
                <div className="absolute left-0 rtl:left-auto rtl:right-0 top-2.5 bottom-2.5 w-1 bg-foreground rounded-full animate-fade-in" />
              )}
              <RefreshCw className="size-4 text-foreground" />
              {t("software_updates") || "Software Updates"}
            </button>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 w-full">
            {renderActiveTab()}
          </div>

        </div>

      </div>
    </div>
  );
}
