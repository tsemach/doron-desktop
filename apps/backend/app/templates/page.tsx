"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Upload, Trash2, FileText, Globe, ArrowLeft, Loader2 } from "lucide-react";
import MainTopBar from "@/components/main/MainTopBar";

interface Template {
  id: string;
  fileName: string;
  title: string;
  url: string;
  language: string;
  fileSize: number;
  createdAt: string;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form states
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState<string>("");
  const [language, setLanguage] = useState<string>("he");
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);

  // Fetch session
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          if (session?.user?.name || session?.user?.email) {
            setUserName(session.user.name || session.user.email);
            setTier(session.user.tier || "free");
          }
        }
      } catch (err) {
        console.error("Failed to fetch session:", err);
      }
    }
    fetchSession();
  }, []);

  // Fetch templates list
  async function fetchTemplates() {
    try {
      setLoading(true);
      // Fetch both Hebrew and English templates
      const [resHe, resEn] = await Promise.all([
        fetch("/api/templates?lang=he"),
        fetch("/api/templates?lang=en"),
      ]);

      if (resHe.ok && resEn.ok) {
        const dataHe = await resHe.json();
        const dataEn = await resEn.json();
        setTemplates([...(dataHe.templates || []), ...(dataEn.templates || [])]);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      // Auto-prefill title from filename
      const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf(".")) || selectedFile.name;
      const cleanTitle = baseName.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      setTitle(cleanTitle);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !language) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("language", language);

    try {
      const res = await fetch("/api/templates/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to upload template");
      }

      setUploadSuccess(true);
      setFile(null);
      setTitle("");
      // Reset file input element
      const fileInput = document.getElementById("file-upload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      // Refresh list
      await fetchTemplates();
    } catch (err: any) {
      setUploadError(err.message || String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document template?")) return;

    try {
      const res = await fetch(`/api/templates?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete template");
      }

      // Refresh list
      await fetchTemplates();
    } catch (err: any) {
      alert(`Delete failed: ${err.message || String(err)}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <MainTopBar userName={userName} tier={tier} handleLogout={handleLogout} />

      <main className="flex-grow w-full max-w-7xl mx-auto px-6 py-10 flex flex-col gap-8">
        {/* Navigation & Title */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              title="Back to Portal"
            >
              <ArrowLeft className="size-5 text-slate-600" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">
                Document Templates Manager
              </h1>
              <p className="text-sm text-slate-500">
                Upload and manage document templates for the Amicus desktop app library.
              </p>
            </div>
          </div>
        </div>

        {/* Content Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Upload Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit">
            <h2 className="text-lg font-semibold mb-4 text-slate-800 flex items-center gap-2">
              <Upload className="size-5 text-teal-600" />
              Upload Template
            </h2>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Template File (DOCX, PDF, Excel, TXT)
                </label>
                <input
                  type="file"
                  id="file-upload"
                  accept=".docx,.pdf,.xlsx,.xls,.txt"
                  onChange={handleFileChange}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 border border-slate-300 rounded-md p-1 bg-slate-50 cursor-pointer"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Template Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Request for Warning Note"
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white"
                >
                  <option value="he">Hebrew (עברית)</option>
                  <option value="en">English</option>
                </select>
              </div>

              {uploadError && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
                  {uploadError}
                </div>
              )}

              {uploadSuccess && (
                <div className="text-sm text-teal-700 bg-teal-50 p-3 rounded-md border border-teal-200">
                  Template uploaded and registered successfully!
                </div>
              )}

              <button
                type="submit"
                disabled={uploading || !file}
                className="w-full flex items-center justify-center gap-2 bg-teal-800 hover:bg-teal-900 disabled:bg-slate-300 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm shadow-sm"
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Upload Template
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Templates List */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[400px]">
            <h2 className="text-lg font-semibold mb-4 text-slate-800 flex items-center gap-2">
              <FileText className="size-5 text-teal-600" />
              Registered Templates ({templates.length})
            </h2>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                <Loader2 className="size-8 animate-spin text-teal-700" />
                <span className="text-sm">Loading template registry...</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-1 border border-dashed border-slate-200 rounded-lg">
                <FileText className="size-12 stroke-[1.2] text-slate-300 mb-2" />
                <p className="font-medium text-sm">No templates registered</p>
                <p className="text-xs text-slate-400">Upload docx/pdf/excel/txt files to see them here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-medium">
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Filename</th>
                      <th className="py-3 px-4">Language</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((tpl) => (
                      <tr
                        key={tpl.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                          {tpl.title}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono text-xs max-w-[180px] truncate">
                          {tpl.fileName}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          <span className="flex items-center gap-1.5 text-xs bg-slate-100 px-2 py-0.5 rounded-full w-fit">
                            <Globe className="size-3 text-slate-400" />
                            {tpl.language === "he" ? "Hebrew" : "English"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 text-xs">
                          {formatBytes(tpl.fileSize)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleDelete(tpl.id)}
                            className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                            title="Delete template"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
