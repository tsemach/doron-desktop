import type { ReactNode } from "react";

type HeroSectionProps = {
  kicker?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Page-specific decorative extra (e.g. the "§" watermark on the home page),
   *  rendered behind the content at the full section width. */
  decoration?: ReactNode;
};

// Dot-grid texture + soft brand-accent gradient blob behind the headline,
// modeled on kadin.co.il's hero atmosphere (see docs/marketing-redesign/plan.md).
// Composes with page-specific extras (e.g. the "§" watermark on the home
// page) rather than replacing them.
export default function HeroSection({ kicker, title, subtitle, children, decoration }: HeroSectionProps) {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-20 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, rgb(148 163 184 / 0.5) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-32 right-1/2 translate-x-1/2 -z-10 h-[28rem] w-[42rem] rounded-full bg-brand-accent/20 blur-3xl"
      />
      {decoration}

      <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        {kicker && (
          <div className="inline-flex items-center gap-3 mb-8">
            <span className="h-px w-8 bg-slate-300" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{kicker}</span>
            <span className="h-px w-8 bg-slate-300" aria-hidden />
          </div>
        )}

        <h1 className="font-display font-semibold text-5xl sm:text-6xl lg:text-7xl tracking-tight text-slate-900 leading-none mb-6">
          {title}
        </h1>

        {subtitle && (
          <p className="text-slate-600 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-8">{subtitle}</p>
        )}

        {children}
      </div>
    </section>
  );
}
