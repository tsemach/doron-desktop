import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";

export const API_KEY_STORAGE_KEY = "claude_api_key";

export default function Settings() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) setApiKey(stored);
  }, []);

  function handleSave() {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex-1 p-4">
      <div className="relative flex items-center mb-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center gap-1">
          ← Back
        </Button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-2xl font-bold">Settings</h1>
      </div>

      <div className="max-w-md space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="api-key">
            Claude API Key
          </label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
            placeholder="sk-ant-..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Used for AI document analysis during indexing. Stored locally on this device.
          </p>
        </div>

        <Button onClick={handleSave} disabled={!apiKey.trim()}>
          {saved ? "Saved!" : "Save"}
        </Button>
      </div>
    </div>
  );
}
