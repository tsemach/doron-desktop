"use client";

import { useLanguage } from "../../context/LanguageContext";

// ASC-157 -- the only language switcher visible to signed-out visitors
// (rendered next to the "Log in" link in MainTopBarUser). Instant-apply,
// cookie-only -- no Save step, no font choice (that's Profile-only, once
// signed in). Signed-in users manage language from Profile > Preferences
// instead, same single-control-surface pattern as desktop's Settings panel.
export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const other = language === "en" ? "he" : "en";
  const otherLabel = other === "en" ? "English" : "עברית";

  return (
    <button
      type="button"
      onClick={() => setLanguage(other)}
      className="text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1 transition-colors cursor-pointer"
      aria-label={`Switch to ${otherLabel}`}
    >
      {otherLabel}
    </button>
  );
}
