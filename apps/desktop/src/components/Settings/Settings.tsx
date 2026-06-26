import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import SettingEmailIntegrationHelp from "./SettingEmailIntegrationHelp";
import SettingAiProviderHelp from "./SettingAiProviderHelp";
import SettingAiHealthCheckResult from "./SettingAiHealthCheckResult";
import SettingBack from "./SettingBack";
import SettingMenuTab, { TabType } from "./SettingMenuTab";

export const API_KEY_STORAGE_KEY = "claude_api_key";
export const USER_NAME_STORAGE_KEY = "user_name";

export default function Settings() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>("preferences");
  const [activeHelp, setActiveHelp] = useState<"email" | "ai" | null>(null);
  const [healthCheckResult, setHealthCheckResult] = useState<any>(null);
  
  const [username, setUsername] = useState("");
  const [saved, setSaved] = useState(false);
  const [tempLang, setTempLang] = useState<Language>(language);

  // Email Server Configuration States
  const [imapServer, setImapServer] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [emailUsername, setEmailUsername] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  // AI Provider (LLM) Configuration States
  const [aiMode, setAiMode] = useState("");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiModel, setAiModel] = useState("");
  const [providerApiKey, setProviderApiKey] = useState("");

  const [savedConfig, setSavedConfig] = useState<{
    aiMode: string;
    provider: string;
    aiModel: string;
    apiKey: string;
  } | null>(null);

  const [savedConfigStatus, setSavedConfigStatus] = useState<"idle" | "verified" | "failed">("idle");
  const [healthStatus, setHealthStatus] = useState<"idle" | "verified" | "failed">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const hasChanges = !isLoadingSettings && (!savedConfig ||
    aiMode !== savedConfig.aiMode ||
    aiProvider !== savedConfig.provider ||
    aiModel !== savedConfig.aiModel ||
    providerApiKey !== savedConfig.apiKey);

  // Mode-specific selection history to preserve UI selections on tab toggle
  const [localProvider, setLocalProvider] = useState("gemini");
  const [localModel, setLocalModel] = useState("gemini-1.5-flash-local");

  const [onlineProvider, setOnlineProvider] = useState("gemini");
  const [onlineModel, setOnlineModel] = useState("gemini-2.0-flash-exp");

  const [byomProvider, setByomProvider] = useState("gemini");
  const [byomModel, setByomModel] = useState("gemini-2.0-flash-exp");
  const [byomApiKey, setByomApiKey] = useState("");

  // Handler functions to sync active states and mode-specific states
  const handleSetAiProvider = (val: string) => {
    setAiProvider(val);
    setSaved(false);
    if (aiMode === "local") {
      setLocalProvider(val);
    } else if (aiMode === "online") {
      setOnlineProvider(val);
    } else if (aiMode === "byom") {
      setByomProvider(val);
    }
  };

  const handleSetAiModel = (val: string) => {
    setAiModel(val);
    setSaved(false);
    if (aiMode === "local") {
      setLocalModel(val);
    } else if (aiMode === "online") {
      setOnlineModel(val);
    } else if (aiMode === "byom") {
      setByomModel(val);
    }
  };

  const handleSetProviderApiKey = (val: string) => {
    setProviderApiKey(val);
    setSaved(false);
    if (aiMode === "byom") {
      setByomApiKey(val);
    }
  };

  const handleSetAiMode = (mode: string) => {
    setAiMode(mode);
    setSaved(false);
    if (mode === "local") {
      setAiProvider(localProvider);
      setAiModel(localModel);
      setProviderApiKey("");
    } else if (mode === "online") {
      setAiProvider(onlineProvider);
      setAiModel(onlineModel);
      setProviderApiKey("");
    } else if (mode === "byom") {
      setAiProvider(byomProvider);
      setAiModel(byomModel);
      setProviderApiKey(byomApiKey);
    }
  };

  // Software Update States
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "up-to-date" | "downloading" | "error">("idle");
  const [updaterError, setUpdaterError] = useState("");
  const [availableVersion, setAvailableVersion] = useState("");
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);

  useEffect(() => {
    const storedName = localStorage.getItem(USER_NAME_STORAGE_KEY);
    if (storedName) setUsername(storedName);

    loadSettings();

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

  async function loadSettings() {
    setIsLoadingSettings(true);
    try {
      // Load email configurations
      try {
        const res = await invoke<any>("get_email_settings");
        if (res) {
          setImapServer(res.imap_server);
          setImapPort(res.imap_port);
          setEmailUsername(res.username);
          setEmailPassword(res.password_enc);
        }
      } catch (e) {
        console.error("Failed to load email configurations:", e);
      }

      // Load AI configurations
      try {
        const res = await invoke<any>("get_ai_settings");
        if (res) {
          const mode = res.ai_mode || "";
          const provider = res.provider || "gemini";
          const model = res.ai_model || "";
          const apiKey = res.api_key_enc || "";

          setAiMode(mode);
          setAiProvider(provider);
          setAiModel(model);
          setProviderApiKey(apiKey);

          setSavedConfig({
            aiMode: mode,
            provider: provider,
            aiModel: model,
            apiKey: apiKey,
          });

          if (mode === "local") {
            setLocalProvider(provider);
            setLocalModel(model);
          } else if (mode === "online") {
            setOnlineProvider(provider);
            setOnlineModel(model);
          } else if (mode === "byom") {
            setByomProvider(provider);
            setByomModel(model);
            setByomApiKey(apiKey);
          }
        }
      } catch (e) {
        console.error("Failed to load AI configurations:", e);
      }
    } finally {
      setIsLoadingSettings(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setSaved(false);

    localStorage.setItem(API_KEY_STORAGE_KEY, providerApiKey.trim());
    localStorage.setItem(USER_NAME_STORAGE_KEY, username.trim());
    setLanguage(tempLang);

    // Save Email Settings
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

    // Save AI Settings
    if (aiMode) {
      // 1. Run health check
      let checkSucceeded = false;
      let checkMessage = "";
      try {
        const response = await invoke<string>("check_ai_health", {
          config: {
            ai_mode: aiMode,
            provider: aiProvider,
            ai_model: aiModel,
            api_key_enc: providerApiKey,
          }
        });
        checkSucceeded = true;
        checkMessage = response;
      } catch (e: any) {
        checkSucceeded = false;
        checkMessage = e.toString();
      }

      // Update states
      setSavedConfigStatus(checkSucceeded ? "verified" : "failed");
      setHealthStatus(checkSucceeded ? "verified" : "failed");
      setHealthCheckResult({
        success: checkSucceeded,
        message: checkMessage,
        modelName: aiModel,
        providerName: aiProvider,
        mode: aiMode,
      });

      try {
        await invoke("save_ai_settings", {
          config: {
            ai_mode: aiMode,
            provider: aiProvider,
            ai_model: aiModel,
            api_key_enc: providerApiKey.trim(),
          }
        });
        setSavedConfig({
          aiMode,
          provider: aiProvider,
          aiModel,
          apiKey: providerApiKey.trim(),
        });
      } catch (e) {
        console.error("Failed to save AI configurations:", e);
        alert("Failed to save AI configurations: " + e);
      }
    }

    setIsSaving(false);
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
            onToggleHelp={() => {
              setHealthCheckResult(null);
              setActiveHelp(activeHelp === "email" ? null : "email");
            }}
            activeHelp={activeHelp}
          />
        );
      case "ai":
        return (
          <SettingAiProvider
            aiMode={aiMode}
            setAiMode={handleSetAiMode}
            aiProvider={aiProvider}
            setAiProvider={handleSetAiProvider}
            aiModel={aiModel}
            setAiModel={handleSetAiModel}
            providerApiKey={providerApiKey}
            setProviderApiKey={handleSetProviderApiKey}
            onSave={handleSave}
            saved={saved}
            setSaved={setSaved}
            savedConfig={savedConfig}
            savedConfigStatus={savedConfigStatus}
            healthStatus={healthStatus}
            setHealthStatus={setHealthStatus}
            hasChanges={hasChanges}
            isSaving={isSaving}
            onToggleHelp={() => {
              setHealthCheckResult(null);
              setActiveHelp(activeHelp === "ai" ? null : "ai");
            }}
            onOpenHelp={() => {
              setHealthCheckResult(null);
              setActiveHelp("ai");
            }}
            activeHelp={activeHelp}
            setHealthCheckResult={(res) => {
              setActiveHelp(null);
              setHealthCheckResult(res);
            }}
          />
        );
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
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-start items-stretch overflow-y-auto">
      
      {/* Navigation & Header (full-width border-b) */}
      <div className="border-b border-border/60 w-full px-8 md:px-12 py-5 shrink-0">
        <SettingBack navigate={navigate} t={t} />
      </div>
 
      {/* Main layout container (left-aligned w-full) */}
      <div className="w-full flex-1 flex flex-col px-8 md:px-12 py-8 md:py-12 space-y-6">
        
        {/* Main Settings Two-Column Layout */}
        <div className="flex flex-col md:flex-row gap-8 w-full items-stretch mt-4 flex-1">
          
          {/* Left Navigation Menu */}
          <SettingMenuTab
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            setActiveHelp={setActiveHelp}
            setHealthCheckResult={setHealthCheckResult}
            t={t}
            aiMode={aiMode}
          />

          {/* Right Content Area */}
          <div className="flex-1 flex flex-col lg:flex-row gap-8 items-stretch w-full">
            <div className="w-full lg:w-[640px] lg:shrink-0">
              {renderActiveTab()}
            </div>
            
            {(activeHelp || healthCheckResult) && (
              <div className="w-full flex-1 lg:max-w-3xl lg:border-l border-border lg:pl-8 pb-6 lg:pb-0 border-t lg:border-t-0 pt-6 lg:pt-0 relative min-h-[400px] lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-2">
                {healthCheckResult ? (
                  <SettingAiHealthCheckResult
                    result={healthCheckResult}
                    onClose={() => setHealthCheckResult(null)}
                  />
                ) : (
                  <>
                    {activeHelp === "email" && (
                      <SettingEmailIntegrationHelp onClose={() => setActiveHelp(null)} />
                    )}
                    {activeHelp === "ai" && (
                      <SettingAiProviderHelp
                        onClose={() => setActiveHelp(null)}
                        aiMode={aiMode}
                        aiProvider={aiProvider}
                        aiModel={aiModel}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
