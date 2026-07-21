import Link from "next/link"

export default function MainTopBarDownload() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-sm font-bold text-teal-200 hover:text-white transition-colors"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-200 text-teal-950 text-xs font-semibold">
        A
      </span>
      <span>Amicus</span>
    </Link>
  )
}
