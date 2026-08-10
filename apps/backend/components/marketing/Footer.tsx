import Link from "next/link";

// Placeholder contact/social content -- no support email or social links
// exist anywhere else in the codebase yet (see docs/marketing-redesign/plan.md,
// "Footer content" decision). Swap for real details when available.
const NAV_LINKS = [
  { label: "Products", href: "/products" },
  { label: "Pricing", href: "/pricing" },
  { label: "Key Features", href: "/resources/key-features" },
  { label: "Download", href: "/download" },
];

const RESOURCE_LINKS = [
  { label: "Documentation", href: "/resources/documentation" },
  { label: "About", href: "/resources/about" },
];

export default function Footer() {
  return (
    <footer className="w-full bg-slate-900 text-slate-300">
      <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <span className="flex items-center gap-2 text-sm font-bold text-white mb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-accent text-brand-accent-foreground text-xs font-semibold">
              A
            </span>
            <span>Ascurix</span>
          </span>
          <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
            The local-first workspace built for attorneys and legal teams.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Navigate</h4>
          <ul className="space-y-2.5">
            {NAV_LINKS.map(({ label, href }) => (
              <li key={href}>
                <Link href={href} className="text-sm text-slate-300 hover:text-brand-accent transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Resources</h4>
          <ul className="space-y-2.5">
            {RESOURCE_LINKS.map(({ label, href }) => (
              <li key={href}>
                <Link href={href} className="text-sm text-slate-300 hover:text-brand-accent transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Contact</h4>
          {/* TODO: placeholder contact/social -- replace with real details */}
          <ul className="space-y-2.5 text-sm text-slate-300">
            <li>support@ascurix.com</li>
            <li className="text-slate-500">Social links TODO</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <p className="max-w-6xl mx-auto px-6 py-5 text-xs text-slate-500">
          © {new Date().getFullYear()} Ascurix. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
