import { Server } from "lucide-react";

interface SettingAiProviderHeaderProps {
  healthStatus: "idle" | "verified" | "failed";
}

export default function SettingAiProviderHeader({
  healthStatus,
}: SettingAiProviderHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 pt-2">
        <Server className="size-4 text-foreground" />
        AI Provider (LLM) Configuration
      </h2>

      {/* Verified Status Dot */}
      {healthStatus !== "idle" && (
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span
            className={`size-2.5 rounded-full ${
              healthStatus === "verified" ? "bg-emerald-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className={healthStatus === "verified" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
            {healthStatus === "verified" ? "Verified" : "Check Failed"}
          </span>
        </div>
      )}
    </div>
  );
}
