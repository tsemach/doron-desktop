import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Key, Eye, EyeOff, Check, Settings as SettingsIcon } from "lucide-react";

export const API_KEY_STORAGE_KEY = "claude_api_key";
export const USER_NAME_STORAGE_KEY = "user_name";

export default function Settings() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedKey) setApiKey(storedKey);

    const storedName = localStorage.getItem(USER_NAME_STORAGE_KEY);
    if (storedName) setUsername(storedName);
  }, []);

  function handleSave() {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
    localStorage.setItem(USER_NAME_STORAGE_KEY, username.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-start items-start p-8 md:p-12">
      <div className="max-w-xl w-full space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="group flex items-center justify-center size-10 rounded-xl border border-border bg-card hover:bg-accent hover:text-foreground transition-all cursor-pointer shadow-sm animate-fade-in"
              title="Go back"
            >
              <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-500 uppercase tracking-wider">
                <SettingsIcon className="size-3 animate-[spin_4s_linear_infinite]" />
                System Preferences
              </div>
              <h1 className="text-2xl font-bold tracking-tight mt-0.5">Settings</h1>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <div className="bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6">
          
          {/* User Name Preference */}
          <div className="space-y-2">
            <label className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5" htmlFor="username">
              <User className="size-4 text-blue-500" />
              User Name
            </label>
            <div className="relative">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setSaved(false); }}
                placeholder="Enter your name..."
                className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Your name displayed on the dashboard welcome banner.
            </p>
          </div>

          {/* Separator line */}
          <div className="border-t border-border/60 my-6"></div>

          {/* AI Settings Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5" htmlFor="api-key">
              <Key className="size-4 text-amber-500" />
              Claude API Key
            </label>
            <div className="relative">
              <input
                id="api-key"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
                placeholder="sk-ant-..."
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-input bg-background/50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used for AI document analysis during indexing. Stored locally on this device.
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
                  Saved!
                </>
              ) : (
                "Save Preferences"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
