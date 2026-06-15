"use client";

import React, { useState, useRef, useEffect } from "react";
import { Download, User, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import MainTopBarUser from "./MainTopBarUser";
import MainTopBarDownload from "./MainTopDownloads";

type Props = {
  userName: string;
  handleLogout: () => void;
}

export default function MainTopBar({ userName, handleLogout }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  return (
    <header className="border-b border-slate-200 px-6 py-1 flex items-center justify-between">
        <MainTopBarDownload />
        <MainTopBarUser userName={userName} handleLogout={handleLogout} />
      </header>
  );
}