import { User, Mail, Server, RefreshCw, Mic } from "lucide-react";
import SettingMenuTabItem from "./SettingMenuTabItem";

export type TabType = "preferences" | "email" | "ai" | "voice" | "update";

function ProBadge() {
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
      Pro
    </span>
  );
}

type SettingMenuTabProps = {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  setActiveHelp: (help: "email" | "ai" | null) => void;
  setHealthCheckResult: (result: any) => void;
  t: (key: any) => string;
  aiMode: string;
  aiTabEnabled: boolean;
  voiceTabEnabled: boolean;
};

export default function SettingMenuTab({
  activeTab,
  setActiveTab,
  setActiveHelp,
  setHealthCheckResult,
  t,
  aiMode,
  aiTabEnabled,
  voiceTabEnabled,
}: SettingMenuTabProps) {
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setActiveHelp(null);
    setHealthCheckResult(null);
  };

  return (
    <div className="w-full md:w-64 flex flex-col gap-1.5 shrink-0 md:border-r rtl:md:border-r-0 rtl:md:border-l border-border md:pr-6 rtl:md:pl-6 pb-6 md:pb-0 border-b md:border-b-0">
      <SettingMenuTabItem
        isActive={activeTab === "preferences"}
        onClick={() => handleTabChange("preferences")}
        icon={User}
        label={t("setting_system_preferences")}
      />

      <SettingMenuTabItem
        isActive={activeTab === "ai"}
        onClick={() => handleTabChange("ai")}
        icon={Server}
        label="AI Provider (LLM)"
        disabled={!aiTabEnabled}
        rightElement={
          !aiTabEnabled ? (
            <ProBadge />
          ) : aiMode ? (
            <span className="size-2 rounded-full bg-emerald-500 shrink-0" title="AI operational" />
          ) : undefined
        }
      />

      <SettingMenuTabItem
        isActive={activeTab === "voice"}
        onClick={() => handleTabChange("voice")}
        icon={Mic}
        label="Voice Input Engine"
        disabled={!voiceTabEnabled}
        rightElement={!voiceTabEnabled ? <ProBadge /> : undefined}
      />

      <SettingMenuTabItem
        isActive={activeTab === "email"}
        onClick={() => handleTabChange("email")}
        icon={Mail}
        label={t("email_integration") || "Email Integration"}
      />
      
      <SettingMenuTabItem
        isActive={activeTab === "update"}
        onClick={() => handleTabChange("update")}
        icon={RefreshCw}
        label={t("software_updates") || "Software Updates"}
      />
    </div>
  );
}
