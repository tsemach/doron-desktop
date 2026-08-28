import * as React from "react";
import { Button } from "../button";
import { cn } from "../../lib/utils";

export type HelpCenterTopic = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
};

export type HelpCenterPageProps = {
  topics: HelpCenterTopic[];
  className?: string;
};

// Shared between apps/desktop and apps/backend per the ASC-24 help-center
// spec. The search bar lives separately (HelpCenterSearchBar) so callers can
// place it in their own page header alongside a back button; this component
// only owns the topic-buttons row.
export function HelpCenterPage({ topics, className }: HelpCenterPageProps) {
  return (
    <div className={cn("w-full max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-3", className)}>
      {topics.map(({ key, label, icon: Icon, onClick }) => (
        <Button key={key} type="button" variant="outline" onClick={onClick} className="gap-2">
          <Icon className="size-4" />
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
}
