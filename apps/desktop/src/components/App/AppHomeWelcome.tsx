import { useLanguage } from "@/context/LanguageContext";
import PlanBadge from "../ui/PlanBadge";
import { useState } from "react";

export function AppHomeWelcome() {
  const { t } = useLanguage();
  const [nameInput, setNameInput] = useState("");
  const [username, setUsername] = useState<string>(() => localStorage.getItem("user_name") || "");
  
  function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (trimmed) {
      localStorage.setItem("user_name", trimmed);
      setUsername(trimmed);
    }
  }

  return (
    // Welcome Title & Input
    <div className="text-center space-y-4 w-full">
      <h2 className="text-3xl font-bold tracking-tight whitespace-nowrap">
        {username ? (
          <>
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider align-middle bg-red-50 text-red-600 border border-red-200 mr-2">
              Beta
            </span>
            {t("welcome")}, {username} <PlanBadge />
          </>
        ) : (
          t("welcome_workspace")
        )}
      </h2>

      {/* Show input below the heading if name doesn't exist */}
      {!username && (
        <form onSubmit={handleSaveName} className="flex items-center justify-center gap-2 mt-6">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={t("enter_name")}
            className="border border-border/80 rounded-lg px-4 py-2 text-sm bg-background w-64 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            type="submit"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-sm"
          >
            {t("save")}
          </button>
        </form>
      )}

      {/* Added max-w-md and mx-auto here to keep the paragraph neat */}
      <p className="text-muted-foreground text-sm max-w-md mx-auto">
        {t("home_desc")}
      </p>
    </div>
  )
}