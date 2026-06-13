"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workspace/ui";
import { Download, LogOut } from "lucide-react";

export default function DownloadDashboard() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="w-full max-w-lg bg-white rounded-lg shadow p-8 text-center relative">
        <button
          onClick={handleLogout}
          className="absolute top-4 right-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>

        <h1 className="text-3xl font-extrabold mb-4">Download Dashboard</h1>
        <p className="text-gray-600 mb-8">
          Welcome! Your account is active. Click below to download the latest desktop installer.
        </p>

        <div className="flex justify-center">
          <a href="/api/download">
            <Button className="flex items-center gap-2 cursor-pointer">
              <Download className="w-4 h-4" />
              Download Standalone App
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
