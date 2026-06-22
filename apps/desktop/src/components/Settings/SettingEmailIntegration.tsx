import { Mail, Eye, EyeOff, Check } from "lucide-react";
import { TranslationKey } from "../../locales/translations";

interface SettingEmailIntegrationProps {
  imapServer: string;
  setImapServer: (val: string) => void;
  imapPort: number;
  setImapPort: (val: number) => void;
  emailUsername: string;
  setEmailUsername: (val: string) => void;
  emailPassword: string;
  setEmailPassword: (val: string) => void;
  showEmailPassword: boolean;
  setShowEmailPassword: (val: boolean) => void;
  onSave: () => void;
  saved: boolean;
  setSaved: (val: boolean) => void;
  t: (key: TranslationKey) => string;
  onToggleHelp: () => void;
  activeHelp: string | null;
}

const HelpCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export default function SettingEmailIntegration({
  imapServer,
  setImapServer,
  imapPort,
  setImapPort,
  emailUsername,
  setEmailUsername,
  emailPassword,
  setEmailPassword,
  showEmailPassword,
  setShowEmailPassword,
  onSave,
  saved,
  setSaved,
  t,
  onToggleHelp,
  activeHelp,
}: SettingEmailIntegrationProps) {
  return (
    <div className="bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6 w-full animate-fade-in">
      <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 pt-2">
        <Mail className="size-4 text-foreground" />
        {t("email_integration") || "Email Integration"}
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 col-span-2 sm:col-span-1">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5" htmlFor="imap-server">
            IMAP Host
            <button
              type="button"
              onClick={onToggleHelp}
              className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted ${
                activeHelp === "email" ? "text-foreground bg-muted" : ""
              }`}
              title="Gmail Connection Help"
            >
              <HelpCircleIcon className="size-3.5" />
            </button>
          </label>
          <input
            id="imap-server"
            type="text"
            value={imapServer}
            onChange={(e) => {
              setImapServer(e.target.value);
              setSaved(false);
            }}
            placeholder="imap.mail.com"
            className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="space-y-2 col-span-2 sm:col-span-1">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5" htmlFor="imap-port">
            IMAP Port
            <button
              type="button"
              onClick={onToggleHelp}
              className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted ${
                activeHelp === "email" ? "text-foreground bg-muted" : ""
              }`}
              title="Gmail Connection Help"
            >
              <HelpCircleIcon className="size-3.5" />
            </button>
          </label>
          <input
            id="imap-port"
            type="number"
            value={imapPort}
            onChange={(e) => {
              setImapPort(Number(e.target.value));
              setSaved(false);
            }}
            placeholder="993"
            className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground" htmlFor="email-username">
          {t("email_username") || "Username (Email)"}
        </label>
        <input
          id="email-username"
          type="email"
          value={emailUsername}
          onChange={(e) => {
            setEmailUsername(e.target.value);
            setSaved(false);
          }}
          placeholder="lawyer@firm.com"
          className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5" htmlFor="email-password">
          {t("email_password") || "Password / App Token"}
          <button
            type="button"
            onClick={onToggleHelp}
            className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted ${
              activeHelp === "email" ? "text-foreground bg-muted" : ""
            }`}
            title="Gmail Connection Help"
          >
            <HelpCircleIcon className="size-3.5" />
          </button>
        </label>
        <div className="relative">
          <input
            id="email-password"
            type={showEmailPassword ? "text" : "password"}
            value={emailPassword}
            onChange={(e) => {
              setEmailPassword(e.target.value);
              setSaved(false);
            }}
            placeholder="••••••••••••"
            className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            type="button"
            onClick={() => setShowEmailPassword(!showEmailPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            {showEmailPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {/* Separator line */}
      <div className="border-t border-border/60 my-6"></div>

      {/* Save Button */}
      <div className="pt-4">
        <button
          onClick={onSave}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer shadow-md ${
            saved
              ? "bg-emerald-600 text-white shadow-emerald-500/10 hover:bg-emerald-700 animate-pulse"
              : "bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black shadow-neutral-950/10 dark:shadow-none"
          }`}
        >
          {saved ? (
            <>
              <Check className="size-4" />
              {t("saved")}
            </>
          ) : (
            t("save_preferences")
          )}
        </button>
      </div>
    </div>
  );
}
