import { X } from "lucide-react";

interface SettingEmailIntegrationHelpProps {
  onClose: () => void;
}

export default function SettingEmailIntegrationHelp({ onClose }: SettingEmailIntegrationHelpProps) {
  return (
    <div className="space-y-4 animate-fade-in relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-0 right-0 text-muted-foreground hover:text-foreground cursor-pointer"
        aria-label="Close help"
      >
        <X className="size-4" />
      </button>

      <h3 className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5 pt-0.5 border-b border-border/60 pb-2">
        Gmail Connection Guide
      </h3>

      <div className="text-xs text-muted-foreground space-y-3.5 leading-relaxed">
        <div className="space-y-1.5 border-b border-border/60 pb-3">
          <p className="font-semibold text-foreground">Why connect email integration?</p>
          <p>
            The system periodically monitors your incoming email correspondence for case-specific details (like case numbers, client names, or subjects) and links relevant messages directly to your active cases.
          </p>
        </div>

        <div className="space-y-1.5 border-b border-border/60 pb-3">
          <p className="font-semibold text-foreground">What is an App Token / App Password?</p>
          <p>
            Modern email providers (such as Google/Gmail) block third-party desktop clients from logging in using your main account credentials. 
            Instead, they require you to generate an isolated, 16-character <strong>App Token</strong> (or App Password) specifically for this application.
          </p>
          <p className="text-[11px] italic">
            This token gives secure access without sharing your actual password, is stored safely on this device, and can be revoked instantly from your Google Account at any time.
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-foreground">How to generate a Gmail App Password:</p>
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
              Navigate to the <strong>Security</strong> tab and ensure <strong>2-Step Verification</strong> is enabled.
            </li>
            <li>
              Search for or go directly to the{" "}
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
              Copy the generated 16-character password and paste it into the <strong>Password / App Token</strong> input here.
            </li>
          </ol>
        </div>

        <div className="border-t border-border/60 pt-3 mt-3">
          <p className="font-semibold text-foreground mb-1">Recommended Host Parameters:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>IMAP Host:</strong> imap.gmail.com</li>
            <li><strong>IMAP Port:</strong> 993</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
