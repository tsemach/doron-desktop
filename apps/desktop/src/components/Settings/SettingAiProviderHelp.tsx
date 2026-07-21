import { useState, useEffect } from "react";
import { X, Cpu, HardDrive, Wifi, Shield, Zap, Layers, Info, ChevronDown, ChevronUp } from "lucide-react";

interface SettingAiProviderHelpProps {
  onClose: () => void;
  aiMode?: string;
  aiProvider?: string;
  aiModel?: string;
}

export default function SettingAiProviderHelp({
  onClose,
  aiMode,
  aiProvider,
  aiModel,
}: SettingAiProviderHelpProps) {
  const [isProfileClosed, setIsProfileClosed] = useState(true);

  useEffect(() => {
    setIsProfileClosed(true);
  }, [aiMode, aiProvider, aiModel]);

  const isSelected = (mode: string) => aiMode === mode;

  interface ModelImplication {
    latency: string;
    privacy: string;
    ramUsage: string;
    cpuUsage: string;
    diskSpace: string;
    internet: string;
    summary: string;
  }

  const getModelImplications = (mode: string, provider: string): ModelImplication | null => {
    if (!mode) return null;

    const provLower = (provider || "").toLowerCase();

    if (mode === "online") {
      let latency = "Fast (0.5s - 1.5s, network dependent)";
      let privacy = "Data sent securely to remote provider cloud";
      let ramUsage = "Negligible (< 50MB runtime overhead)";
      let cpuUsage = "Negligible (< 1% CPU utilization)";
      let diskSpace = "0 GB (Hosted in the cloud)";
      let internet = "Active Internet Connection Required";
      let summary = "Uses our pre-configured fast online cloud servers. Highly recommended for standard PCs and energy saving.";

      if (provLower === "gemini") {
        summary = "Leverages Google's hosted Gemini endpoints. Delivers sub-second latencies with zero local memory or storage cost.";
      } else if (provLower === "openai") {
        summary = "Leverages hosted OpenAI API services. Fast, powerful, and has absolutely zero impact on local computer speed.";
      } else if (provLower === "anthropic") {
        summary = "Routes requests to hosted Anthropic (Claude) servers. Premium quality reasoning without draining your computer's resources.";
      }

      return { latency, privacy, ramUsage, cpuUsage, diskSpace, internet, summary };
    }

    if (mode === "byom") {
      const providerName = provider || "selected";
      return {
        latency: "Dependent on selected provider network latency (typically 1-2s)",
        privacy: `Requests sent directly from your device to your personal ${providerName.charAt(0).toUpperCase() + providerName.slice(1)} API account`,
        ramUsage: "Negligible (< 50MB runtime overhead)",
        cpuUsage: "Negligible (< 1% CPU utilization)",
        diskSpace: "0 GB (Cloud Hosted)",
        internet: "Active Internet Connection Required",
        summary: `Runs using your personal API keys. Data routes directly to ${providerName.charAt(0).toUpperCase() + providerName.slice(1)} and usage fees are billed directly to your personal developer account.`
      };
    }

    return null;
  };

  const renderResourceProfile = () => {
    const imp = getModelImplications(aiMode || "", aiProvider || "");
    if (!imp) return null;

    return (
      <div className="bg-background border border-border rounded-xl mt-3 animate-fade-in text-[11px] shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsProfileClosed(!isProfileClosed)}
          className={`w-full flex items-center justify-between p-3.5 text-left font-bold text-foreground uppercase tracking-wider text-[9px] cursor-pointer hover:bg-muted/40 transition-colors ${
            !isProfileClosed ? "border-b border-border/40" : ""
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Info className="size-3.5 text-foreground/80" />
            <span>Live Resource & System Profile</span>
          </div>
          {isProfileClosed ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="size-4 text-muted-foreground" />
          )}
        </button>

        {!isProfileClosed && (
          <div className="p-4 space-y-3.5 animate-fade-in">
            <p className="font-medium text-foreground leading-relaxed text-[11px]">
              {imp.summary}
            </p>

            <div className="grid grid-cols-1 gap-2.5 pt-1">
              <div className="flex items-start gap-2">
                <Zap className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-[9px] text-foreground uppercase tracking-wider leading-none">Latency</span>
                  <span className="text-muted-foreground leading-normal mt-0.5 block">{imp.latency}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-border/20 pt-2">
                <Shield className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-[9px] text-foreground uppercase tracking-wider leading-none">Privacy & Security</span>
                  <span className="text-muted-foreground leading-normal mt-0.5 block">{imp.privacy}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-border/20 pt-2">
                <Layers className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-[9px] text-foreground uppercase tracking-wider leading-none">Memory (RAM) Footprint</span>
                  <span className="text-muted-foreground leading-normal mt-0.5 block">{imp.ramUsage}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-border/20 pt-2">
                <Cpu className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-[9px] text-foreground uppercase tracking-wider leading-none">Compute (CPU/GPU) Load</span>
                  <span className="text-muted-foreground leading-normal mt-0.5 block">{imp.cpuUsage}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-border/20 pt-2">
                <HardDrive className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-[9px] text-foreground uppercase tracking-wider leading-none">Local Disk Storage</span>
                  <span className="text-muted-foreground leading-normal mt-0.5 block">{imp.diskSpace}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-border/20 pt-2">
                <Wifi className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-[9px] text-foreground uppercase tracking-wider leading-none">Network & Internet</span>
                  <span className="text-muted-foreground leading-normal mt-0.5 block">{imp.internet}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-0 right-0 text-muted-foreground hover:text-foreground cursor-pointer"
        aria-label="Close help"
      >
        <X className="size-4" />
      </button>

      <h3 className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5 pt-0.5 border-b border-border/60 pb-2">
        AI Provider (LLM) Configuration Guide
      </h3>

      <div className="text-xs text-muted-foreground space-y-4 leading-relaxed">
        {/* 1. Use Online Model */}
        <div className="space-y-1.5 pb-4 border-b border-border/60">
          <p className="font-semibold text-foreground">1. Use Online Model (Requires Pro)</p>
          <p>
            Uses our pre-configured fast online cloud servers. This gives you instant access to optimized models like GPT-4o-mini or Gemini Flash without needing any local hardware setup, powered by our shared API gateway services.
          </p>

          {isSelected("online") && renderResourceProfile()}
        </div>

        {/* 2. Bring Your Own Model (BYOM) */}
        <div className="space-y-1.5 pb-4 border-b border-border/60">
          <p className="font-semibold text-foreground">2. Bring Your Own Model (BYOM)</p>
          <p>
            Gives you absolute customization by letting you connect your personal API credentials.
            You enter your own API key directly for Google Gemini, OpenAI, or Anthropic (Claude), and the app will route LLM classification directly to your account.
          </p>

          {isSelected("byom") && renderResourceProfile()}
        </div>

        <div className="space-y-1.5 pt-1">
          <p className="font-semibold text-foreground">How does the Health Check work?</p>
          <p>
            Clicking the <strong>Health Check</strong> button will verify if your selected model setup is working properly.
            For BYOM, it performs a real connection check to the API. For online pro mode, it runs a simulated system sanity verification to confirm readiness.
          </p>
        </div>
      </div>
    </div>
  );
}
