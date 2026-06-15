"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workspace/ui";
import { Download, User, LogOut, Settings } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import MainTopBar from "@/components/MainTopBar";

export default function Home() {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userName, setUserName] = useState<string>("User");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  // Fetch current session info on mount
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          if (session?.user?.name) {
            setUserName(session.user.name);
          } else if (session?.user?.email) {
            // Fallback to email if name is not set
            setUserName(session.user.email);
          }
        }
      } catch (err) {
        console.error("Failed to fetch session:", err);
      }
    }
    fetchSession();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      
      <MainTopBar userName={userName} handleLogout={handleLogout} />

      <main className="flex-grow flex flex-col justify-center items-center px-4 py-12">
        <div className="max-w-5xl w-full flex flex-col items-center gap-12">
          
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              Welcome to Doron Client Portal
            </h2>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              Access secure applications, desktop installers, and manage your account configurations.
            </p>
          </div>
        </div>
      </main>

    </div>
  );
}
