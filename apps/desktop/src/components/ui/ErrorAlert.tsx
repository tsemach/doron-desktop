import { AlertCircle } from "lucide-react";

import { Button } from "./button";

type ErrorAlertProps = {
  message: string;
  onClose: () => void;
  title?: string;
};

export default function ErrorAlert({ message, onClose, title = "Error" }: ErrorAlertProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="alertdialog"
        aria-labelledby="error-alert-title"
        aria-describedby="error-alert-message"
        className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
            <AlertCircle className="size-5" aria-hidden />
          </div>
          <div className="space-y-1.5 min-w-0 flex-1">
            <h3 id="error-alert-title" className="text-lg font-bold text-foreground">
              {title}
            </h3>
            <p id="error-alert-message" className="text-sm text-muted-foreground leading-normal">
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button size="sm" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
