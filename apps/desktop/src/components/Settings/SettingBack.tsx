import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";

type SettingBackProps = {
  navigate: (path: any) => void;
  t: (key: any) => string;
}

export default function SettingBack({navigate, t}:SettingBackProps) {
    return (
      <div className="flex items-center justify-between border-b border-border/60 pb-5 w-full">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="group flex items-center justify-center size-10 rounded-xl border border-border bg-card hover:bg-accent hover:text-foreground transition-all cursor-pointer shadow-sm animate-fade-in"
            title="Go back"
          >
            <ArrowLeft className="size-4 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5 transition-transform" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-500 uppercase tracking-wider">
              <SettingsIcon className="size-3 animate-[spin_4s_linear_infinite]" />
              {t("setting_save_preferences")}
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-0.5">{t("settings")}</h1>
          </div>
        </div>
      </div>
    )
  }
