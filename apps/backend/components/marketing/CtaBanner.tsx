import Link from "next/link";

type CtaBannerProps = {
  title: string;
  subtitle?: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

// Dark gradient conversion banner used near the end of marketing pages,
// modeled on kadin.co.il's pre-footer CTA block.
export default function CtaBanner({
  title,
  subtitle,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: CtaBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-brand-accent/30 px-8 py-14 sm:px-16 text-center">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white mb-3">{title}</h2>
      {subtitle && <p className="text-slate-300 max-w-xl mx-auto mb-8">{subtitle}</p>}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href={primaryHref}>
          <div className="bg-brand-accent hover:brightness-110 text-brand-accent-foreground font-semibold rounded-full px-7 py-3 text-sm transition-all cursor-pointer">
            {primaryLabel}
          </div>
        </Link>
        {secondaryHref && secondaryLabel && (
          <Link href={secondaryHref}>
            <div className="px-7 py-3 border border-white/20 hover:bg-white/10 text-white rounded-full text-sm font-semibold transition-all cursor-pointer">
              {secondaryLabel}
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
