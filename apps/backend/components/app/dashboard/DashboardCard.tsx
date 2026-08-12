import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type DashboardCardProps = {
  icon: LucideIcon;
  title: string;
  count?: number;
  children: ReactNode;
};

export default function DashboardCard({ icon: Icon, title, count, children }: DashboardCardProps) {
  return (
    <div className="rounded-2xl bg-card shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="font-heading text-base font-bold text-foreground">{title}</h2>
        {typeof count === "number" && (
          <span className="ml-auto text-xs font-medium text-muted-foreground">{count}</span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
