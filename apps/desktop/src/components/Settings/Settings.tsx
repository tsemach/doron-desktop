import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { Language } from "../../locales/translations";
import { invoke } from "@tauri-apps/api/core";
import { useAtom, useAtomValue } from "jotai";
import { aiConfigAtom, aiConfigStatusAtom } from "../../store/aiStore";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { useFeatureEnabled } from "../../lib/featureGating";

import SettingPreferences from "./SettingPreferences";
import SettingEmailIntegration from "./SettingEmailIntegration";
import SettingAiProvider from "./SettingAiProvider";
import SettingVoiceEngine from "./SettingVoiceEngine";
import SettingSoftwareUpdate from "./SettingSoftwareUpdate";
import SettingEmailIntegrationHelp from "./SettingEmailIntegrationHelp";
import SettingAiProviderHelp from "./SettingAiProviderHelp";
import SettingVoiceEngineHelp from "./SettingVoiceEngineHelp";
import SettingAiHealthCheckResult from "./SettingAiHealthCheckResult";
import SettingBack from "./SettingBack";
import SettingMenuTab, { TabType } from "./SettingMenuTab";

export const API_KEY_STORAGE_KEY = "claude_api_key";

export default function Settings() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>("preferences");
  const [activeHelp, setActiveHelp] = useState<"email" | "ai" | "voice" | null>(null);
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

  // AI Provider (LLM) Configuration States. Local mode is deprecated and no
  // longer selectable from Settings (see AMI-65) -- "online" is now the
  // implicit default instead of an unset "" that used to force picking a
  // mode card first.
  const [aiMode, setAiMode] = useState("online");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiModel, setAiModel] = useState("");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [voiceEngine, setVoiceEngineState] = useState("cloud");
  const [voiceModel, setVoiceModelState] = useState("whisper multilingual (small)");
  const [voiceCloudProvider, setVoiceCloudProviderState] = useState("gemini");
  const [voiceCloudApiKey, setVoiceCloudApiKeyState] = useState("");
  const [voiceCloudModel, setVoiceCloudModelState] = useState("gemini-3.5-flash");

  const [savedConfig, setSavedConfig] = useAtom(aiConfigAtom);
  const savedConfigStatus = useAtomValue(aiConfigStatusAtom);
  const [healthStatus, setHealthStatus] = useState<"idle" | "verified" | "failed">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Free-tier gating for the AI Provider and Voice Input Engine tabs.
  const aiTabEnabled = useFeatureEnabled("ai_features");
  const voiceTabEnabled = useFeatureEnabled("voice_recording");

  // Bounce off a gated tab if the tier changes (e.g. a Pro subscription
  // lapsing) while it's the active one, so the nav's disabled state never
  // shows stale content still sitting behind it.
  useEffect(() => {
    if (!aiTabEnabled && activeTab === "ai") setActiveTab("preferences");
    if (!voiceTabEnabled && activeTab === "voice") setActiveTab("preferences");
  }, [aiTabEnabled, voiceTabEnabled, activeTab]);

  // Sync healthStatus with savedConfigStatus on mount or startup check completion
  useEffect(() => {
    setHealthStatus(savedConfigStatus);
  }, [savedConfigStatus]);

  const hasChanges = !isLoadingSettings && (!savedConfig ||
    aiMode !== savedConfig.aiMode ||
    aiProvider !== savedConfig.provider ||
    aiModel !== savedConfig.aiModel ||
    providerApiKey !== savedConfig.apiKey ||
    voiceEngine !== savedConfig.voiceEngine ||
    voiceModel !== savedConfig.voiceModel ||
    voiceCloudProvider !== savedConfig.voiceCloudProvider ||
    voiceCloudApiKey !== savedConfig.voiceCloudApiKey ||
    voiceCloudModel !== savedConfig.voiceCloudModel);

  // Mode-specific selection history to preserve UI selections on tab toggle
  const [onlineProvider, setOnlineProvider] = useState("gemini");
  const [onlineModel, setOnlineModel] = useState("gemini-2.0-flash-exp");

  const [byomProvider, setByomProvider] = useState("gemini");
  const [byomModel, setByomModel] = useState("gemini-2.0-flash-exp");
  const [byomApiKey, setByomApiKey] = useState("");

  // Handler functions to sync active states and mode-specific states
  const handleSetAiProvider = (val: string) => {
    setAiProvider(val);
    setSaved(false);
    if (aiMode === "online") {
      setOnlineProvider(val);
    } else if (aiMode === "byom") {
      setByomProvider(val);
    }
  };

  const handleSetAiModel = (val: string) => {
    setAiModel(val);
    setSaved(false);
    if (aiMode === "online") {
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

  const handleSetVoiceCloudProvider = (val: string) => {
    setVoiceCloudProviderState(val);
    setSaved(false);
  };

  const handleSetVoiceCloudApiKey = (val: string) => {
    setVoiceCloudApiKeyState(val);
    setSaved(false);
  };

  const handleSetVoiceCloudModel = (val: string) => {
    setVoiceCloudModelState(val);
    setSaved(false);
  };

  const handleSetAiMode = (mode: string) => {
    setAiMode(mode);
    setSaved(false);
    if (mode === "online") {
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
      // Load user settings (display name)
      try {
        const res = await invoke<any>("get_user_settings");
        if (res) {
          setUsername(res.username);
        }
      } catch (e) {
        console.error("Failed to load user settings:", e);
      }

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
          // Local mode is no longer selectable from Settings (AMI-65) -- a
          // config saved before that change is displayed/compared here as
          // "online" (remapping its local-only provider id to an online
          // equivalent). The Rust backend still gets the raw value at
          // startup via aiStore.ts::triggerGlobalHealthCheck, so an existing
          // local-mode user's app keeps behaving exactly as before until
          // they interact with Settings again.
          const rawMode = res.ai_mode || "";
          const mode = rawMode === "local" ? "online" : (rawMode || "online");
          const rawProvider = res.provider || "gemini";
          const localToOnlineProvider: Record<string, string> = { google: "gemini", microsoft: "openai", alibaba: "gemini" };
          const provider = rawMode === "local" ? (localToOnlineProvider[rawProvider] || "gemini") : rawProvider;
          const model = rawMode === "local" ? "" : (res.ai_model || "");
          const apiKey = res.api_key_enc || "";
          const voiceEngineValue = res.voice_engine === "local" ? "cloud" : (res.voice_engine || "cloud");
          const voiceModelValue = res.voice_model || "whisper multilingual (small)";
          const voiceCloudProviderValue = res.voice_cloud_provider || "gemini";
          const voiceCloudApiKeyValue = res.voice_cloud_api_key || "";
          const voiceCloudModelValue = res.voice_cloud_model || "gemini-3.5-flash";

          setAiMode(mode);
          setAiProvider(provider);
          setAiModel(model);
          setProviderApiKey(apiKey);
          setVoiceEngineState(voiceEngineValue);
          setVoiceModelState(voiceModelValue);
          setVoiceCloudProviderState(voiceCloudProviderValue);
          setVoiceCloudApiKeyState(voiceCloudApiKeyValue);
          setVoiceCloudModelState(voiceCloudModelValue);

          setSavedConfig({
            aiMode: mode,
            provider: provider,
            aiModel: model,
            apiKey: apiKey,
            voiceEngine: voiceEngineValue,
            voiceModel: voiceModelValue,
            voiceCloudProvider: voiceCloudProviderValue,
            voiceCloudApiKey: voiceCloudApiKeyValue,
            voiceCloudModel: voiceCloudModelValue,
          });

          if (mode === "online") {
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
    setLanguage(tempLang);

    // Save user settings (display name)
    try {
      await invoke("save_user_settings", { settings: { username: username.trim() } });
    } catch (e) {
      console.error("Failed to save user settings:", e);
      alert("Failed to save user settings: " + e);
    }

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

    // Save AI Settings — persists only; health is checked on-demand via the
    // "Run Health Check" buttons, never automatically as a side effect of saving.
    if (aiMode) {
      try {
        await invoke("save_ai_settings", {
          config: {
            ai_mode: aiMode,
            provider: aiProvider,
            ai_model: aiModel,
            api_key_enc: providerApiKey.trim(),
            voice_engine: voiceEngine,
            voice_model: voiceModel,
            voice_cloud_provider: voiceCloudProvider,
            voice_cloud_api_key: voiceCloudApiKey.trim(),
            voice_cloud_model: voiceCloudModel,
          }
        });
        setSavedConfig({
          aiMode,
          provider: aiProvider,
          aiModel,
          apiKey: providerApiKey.trim(),
          voiceEngine,
          voiceModel,
          voiceCloudProvider,
          voiceCloudApiKey: voiceCloudApiKey.trim(),
          voiceCloudModel,
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
      case "voice":
        return (
          <SettingVoiceEngine
            voiceCloudProvider={voiceCloudProvider}
            setVoiceCloudProvider={handleSetVoiceCloudProvider}
            voiceCloudApiKey={voiceCloudApiKey}
            setVoiceCloudApiKey={handleSetVoiceCloudApiKey}
            voiceCloudModel={voiceCloudModel}
            setVoiceCloudModel={handleSetVoiceCloudModel}
            onToggleHelp={() => {
              setHealthCheckResult(null);
              setActiveHelp(activeHelp === "voice" ? null : "voice");
            }}
            activeHelp={activeHelp}
            onSave={handleSave}
            saved={saved}
            hasChanges={hasChanges}
            isSaving={isSaving}
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
            aiMode={savedConfig?.aiMode || ""}
            aiTabEnabled={aiTabEnabled}
            voiceTabEnabled={voiceTabEnabled}
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
                    {activeHelp === "voice" && (
                      <SettingVoiceEngineHelp onClose={() => setActiveHelp(null)} />
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
