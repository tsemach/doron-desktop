import type { LucideIcon } from "lucide-react";

export type FeatureRowItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export default function FeatureRow({ icon: Icon, title, description }: FeatureRowItem) {
  return (
    <div className="flex items-start gap-3 py-4">
      <div className="w-8 h-8 rounded-md bg-brand-accent/10 border border-brand-accent/20 text-brand-accent flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <p className="text-sm text-slate-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
