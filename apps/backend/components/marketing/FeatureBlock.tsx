import { Check, type LucideIcon } from "lucide-react";

export type FeatureBlockMockup =
  | { type: "screenshot"; src: string; alt: string }
  | { type: "illustrated"; label?: string };

type FeatureBlockProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets?: string[];
  mockup: FeatureBlockMockup;
  /** Which column the text lives in -- alternate per section for rhythm. */
  side?: "left" | "right";
};

// Alternating icon+checklist / mockup section, modeled on kadin.co.il's
// feature blocks (see docs/marketing-redesign/plan.md). When a feature
// doesn't have a clean product screenshot yet, `mockup.type: "illustrated"`
// renders a stylized placeholder frame instead of leaving the slot empty.
export default function FeatureBlock({ icon: Icon, title, description, bullets, mockup, side = "left" }: FeatureBlockProps) {
  const textCol = (
    <div className="flex flex-col justify-center gap-4">
      <div className="w-11 h-11 rounded-lg bg-brand-accent/10 border border-brand-accent/20 text-brand-accent flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-2xl sm:text-3xl font-display font-semibold text-slate-900">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
      {bullets && bullets.length > 0 && (
        <ul className="space-y-2 mt-1">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm text-slate-700">
              <Check className="w-4 h-4 mt-0.5 shrink-0 text-brand-accent" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const mockupCol = (
    <div className="flex items-center justify-center">
      {mockup.type === "screenshot" ? (
        <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 overflow-hidden">
          <img src={mockup.src} alt={mockup.alt} className="w-full h-auto object-cover" />
        </div>
      ) : (
        <IllustratedFrame label={mockup.label ?? title} />
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 items-center py-12">
      {side === "left" ? (
        <>
          {textCol}
          {mockupCol}
        </>
      ) : (
        <>
          <div className="order-2 md:order-1">{mockupCol}</div>
          <div className="order-1 md:order-2">{textCol}</div>
        </>
      )}
    </div>
  );
}

function IllustratedFrame({ label }: { label: string }) {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 p-5">
      <div className="flex items-center gap-1.5 pb-3 mb-4 border-b border-slate-100">
        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
        <span className="ml-2 text-[11px] font-medium text-slate-400 truncate">{label}</span>
      </div>
      <div className="space-y-3">
        <div className="h-3 w-2/3 rounded-full bg-brand-accent/20" />
        <div className="h-3 w-full rounded-full bg-slate-100" />
        <div className="h-3 w-5/6 rounded-full bg-slate-100" />
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="h-16 rounded-lg bg-slate-50 border border-slate-100" />
          <div className="h-16 rounded-lg bg-brand-accent/10 border border-brand-accent/20" />
          <div className="h-16 rounded-lg bg-slate-50 border border-slate-100" />
        </div>
      </div>
    </div>
  );
}
