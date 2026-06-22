import { useState } from "react";
import { Mail, Eye, EyeOff, Check, X } from "lucide-react";
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
}

const HelpCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
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
}: SettingEmailIntegrationProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="flex flex-col xl:flex-row gap-6 w-full items-start animate-fade-in">
      {/* Main Email Settings Card */}
      <div className="flex-1 bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6 w-full">
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
                onClick={() => setShowHelp(!showHelp)}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
                onClick={() => setShowHelp(!showHelp)}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
          <label className="text-xs font-semibold text-foreground" htmlFor="email-password">
            {t("email_password") || "Password / App Token"}
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

      {/* Gmail Help Panel */}
      {showHelp && (
        <div className="w-full xl:w-80 shrink-0 bg-card border border-border/80 shadow-lg rounded-2xl p-6 space-y-4 animate-fade-in relative self-stretch">
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Close help"
          >
            <X className="size-4" />
          </button>
          <h3 className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5 pt-1 border-b border-border/60 pb-2">
            Gmail Connection Guide
          </h3>
          <div className="text-xs text-muted-foreground space-y-3 leading-relaxed">
            <p>
              To connect your Gmail account, you need to use an <strong>App Password</strong> rather than your regular Google account password.
            </p>
            <ol className="list-decimal pl-4 space-y-2">
              <li>
                Go to your{" "}
                <a
                  href="https://myaccount.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline font-semibold"
                >
                  Google Account Settings
                </a>.
              </li>
              <li>
                Navigate to <strong>Security</strong> and ensure <strong>2-Step Verification</strong> is enabled.
              </li>
              <li>
                Go to the{" "}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline font-semibold"
                >
                  App Passwords page
                </a>.
              </li>
              <li>
                Generate a new app password (select "Other" and name it "Doron Desktop").
              </li>
              <li>
                Copy the 16-character password and paste it into the <strong>Password / App Token</strong> field here.
              </li>
            </ol>
            <div className="border-t border-border/60 pt-2 mt-2">
              <p className="font-semibold text-foreground mb-1">Recommended Settings:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>IMAP Host:</strong> imap.gmail.com</li>
                <li><strong>IMAP Port:</strong> 993</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
