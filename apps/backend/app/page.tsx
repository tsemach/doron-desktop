import { Button } from "@workspace/ui";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-55 text-gray-900 p-6">
      <header className="text-center max-w-xl">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-4">
          Hello from Doron Desktop Portal!
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          To access the desktop application installer, please log in to your account.
        </p>
        <div className="flex justify-center">
          <Link href="/login">
            <Button className="flex items-center gap-2 cursor-pointer">
              Go to Portal Login
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </header>
    </div>
  );
}
