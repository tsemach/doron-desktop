import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, RefreshCw, X, Sparkles } from "lucide-react";

export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "downloading" | "installing" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeUpdate, setActiveUpdate] = useState<any>(null);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        setStatus("checking");
        const update = await check();
        if (update) {
          setUpdateAvailable(true);
          setVersion(update.version);
          setActiveUpdate(update);
          setStatus("idle");
        } else {
          setStatus("idle");
        }
      } catch (err: any) {
        console.error("Failed to check for updates on startup:", err);
        setStatus("error");
        setErrorMessage(err.message || "Could not check for updates.");
      }
    };

    // Check on startup with a slight delay to ensure webview is fully loaded
    const timer = setTimeout(() => {
      checkUpdate();
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const handleInstall = async () => {
    if (!activeUpdate) return;
    try {
      setStatus("downloading");
      
      // Downloads and installs the signed executable in the background
      await activeUpdate.downloadAndInstall();
      
      setStatus("done");
      
      // Restart the app immediately to run the new version
      await relaunch();
    } catch (err: any) {
      console.error("Auto-update failed:", err);
      setStatus("error");
      setErrorMessage(err.message || "Failed to install the update.");
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-lg px-4 transition-all duration-300 ease-out">
      <div className="bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl border border-blue-500/20 dark:border-blue-500/30 rounded-2xl shadow-xl shadow-blue-500/5 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-500 shadow-sm animate-pulse">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
              New Update Available
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Version {version} is ready for installation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === "downloading" ? (
            <button
              disabled
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-500/10 text-blue-500 text-xs font-semibold rounded-lg"
            >
              <RefreshCw className="size-3.5 animate-spin" />
              <span>Updating...</span>
            </button>
          ) : status === "error" ? (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-red-500 max-w-[120px] truncate">{errorMessage}</span>
              <button
                onClick={handleInstall}
                className="mt-1 flex items-center gap-1.5 px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400 text-white dark:text-zinc-950 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm shadow-blue-500/10"
            >
              <Download className="size-3.5" />
              <span>Update Now</span>
            </button>
          )}

          <button
            onClick={() => setUpdateAvailable(false)}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
