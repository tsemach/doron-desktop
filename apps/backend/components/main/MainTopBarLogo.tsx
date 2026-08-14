import Link from "next/link"

type MainTopBarLogoProps = {
  href?: string;
};

export default function MainTopBarLogo({ href = "/" }: MainTopBarLogoProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 text-sm font-bold text-foreground hover:opacity-80 transition-opacity"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
        A
      </span>
      <span>Ascurix</span>
    </Link>
  )
}
