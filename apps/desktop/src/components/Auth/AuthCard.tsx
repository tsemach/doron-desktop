import type { ReactNode } from "react";
import BackButton from "../ui/back-button";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  backTo?: string;
}

// Mirrors apps/backend/components/auth/AuthCard.tsx so the desktop auth
// screens look like the same product as the web portal's login/register.
export default function AuthCard({ title, subtitle, children, backTo }: AuthCardProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      {backTo && <BackButton navigateTo={backTo} className="absolute top-4 left-4" />}
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-lg font-semibold">A</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
