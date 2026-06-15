import { Download } from "lucide-react"
import Link from "next/link"

export default function MainTopBarDownload() {
  return (
    <Link 
      href="/download" 
      className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
    >
      <Download className="w-4 h-4" />
      <span>Download</span>
    </Link>
  )
}