import Link from "next/link"

export default function MainTopBarLogo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-sm font-bold text-foreground hover:opacity-80 transition-opacity"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
        A
      </span>
      <span>Amicus</span>
    </Link>
  )
}
