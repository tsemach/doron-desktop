import Link from "next/link"
import Image from "next/image"

type Props = {
  // The "A" square used to pick up its color from bg-primary/text-primary-foreground,
  // which flip with the page's light/dark theme (see app/page.tsx's "Pinned to
  // dark mode" comment). A raster logo can't recolor itself the same way, so
  // instead we swap between two fixed-color logo files based on which theme the
  // page is actually rendered in: white on the dark-pinned home page, black
  // everywhere else (light/bright backgrounds).
  variant?: "dark" | "light"
}

export default function MainTopBarLogo({ variant = "light" }: Props) {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-sm font-bold text-foreground hover:opacity-80 transition-opacity"
    >
      <Image
        src={variant === "dark" ? "/ascurix-logo-white.png" : "/ascurix-logo-black.png"}
        alt="Ascurix"
        width={24}
        height={24}
        className="h-6 w-6 object-contain"
      />
      <span>Ascurix</span>
    </Link>
  )
}
