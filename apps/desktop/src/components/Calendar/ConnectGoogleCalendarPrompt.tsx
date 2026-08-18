import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CalendarDays } from "lucide-react";
import { Button } from "../ui/button";
import { useLanguage } from "../../context/LanguageContext";

interface ConnectGoogleCalendarPromptProps {
  // connect_google_calendar's promise only resolves once the whole flow
  // (browser consent + loopback callback + token exchange) has actually
  // finished, so the parent can just reload its status here directly --
  // no polling needed for the deep-link-callback-lands-asynchronously case
  // this used to have to guess about.
  onConnected: () => void;
}

// Shown whenever get_google_calendar_status returns null -- a Google
// connection is required before the Calendar tab does anything else (no
// local-only mode, design.md §1 goal 2 / why-and-requirements.md R3).
export default function ConnectGoogleCalendarPrompt({ onConnected }: ConnectGoogleCalendarPromptProps) {
  const { t } = useLanguage();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      await invoke("connect_google_calendar");
      onConnected();
    } catch (err) {
      setError(String(err));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-sm text-center flex flex-col items-center gap-4 px-6">
        <div className="size-16 rounded-2xl border border-border bg-muted/40 flex items-center justify-center text-foreground/70">
          <CalendarDays className="size-8" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">{t("calendar_connect_title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("calendar_connect_description")}</p>
        </div>
        <Button onClick={handleConnect} disabled={connecting}>
          {connecting ? t("calendar_connecting") : t("calendar_connect_button")}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
