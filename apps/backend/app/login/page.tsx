"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workspace/ui";
import { signIn } from "next-auth/react";
import { Lock, Mail, User, AlertCircle, ArrowRight } from "lucide-react";

export default function Login() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  
  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Status states
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (activeTab === "signup") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        // Sign-up flow
        const signupRes = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName, email, password }),
        });

        const data = await signupRes.json();

        if (!signupRes.ok) {
          throw new Error(data.error || "Failed to create account");
        }

        setSignupSuccess(true);
        // Auto sign in user after successful registration
        const loginRes = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (loginRes?.error) {
          setError("Account created, but automatic sign-in failed. Please sign in manually.");
          setActiveTab("signin");
          setLoading(false);
        } else {
          router.push("/");
          router.refresh();
        }
      } else {
        // Sign-in flow
        const loginRes = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (loginRes?.error) {
          setError("Invalid email or password");
          setLoading(false);
        } else {
          router.push("/");
          router.refresh();
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "facebook") => {
    setError("");
    setLoading(true);
    try {
      await signIn(provider, { callbackUrl: "/" });
    } catch (err) {
      setError(`Failed to initialize ${provider} login`);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Subtle Dynamic Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[8000ms]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-100/50 rounded-full blur-[140px] pointer-events-none animate-pulse duration-[6000ms]"></div>
      <div className="absolute top-[30%] right-[20%] w-[350px] h-[350px] bg-purple-100/30 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Main Glassmorphic Container (Light Theme) */}
      <div className="relative z-10 w-full max-w-md bg-white/70 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/80 p-8 mx-4 transition-all duration-300">
        
        {/* Portal Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
            Doron Client Portal
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Access secure downloads and application updates
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 bg-slate-100/80 p-1.5 rounded-lg border border-slate-200/60 mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab("signin");
              setError("");
              setConfirmPassword("");
            }}
            className={`py-2 text-sm font-semibold rounded-md transition-all duration-200 cursor-pointer ${
              activeTab === "signin"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200/30"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("signup");
              setError("");
              setConfirmPassword("");
            }}
            className={`py-2 text-sm font-semibold rounded-md transition-all duration-200 cursor-pointer ${
              activeTab === "signup"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200/30"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-5 text-xs font-medium animate-headShake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {signupSuccess && !error && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-600 p-3 rounded-lg mb-5 text-xs font-medium">
            <svg className="w-4 h-4 shrink-0 mt-0.5 fill-none text-emerald-600" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Creating account and logging you in...</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {activeTab === "signup" && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Full Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="John Doe"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          {activeTab === "signup" && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Verify Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full mt-2 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10"
            disabled={loading}
          >
            <span>{loading ? "Processing..." : activeTab === "signin" ? "Sign In" : "Sign Up"}</span>
            {!loading && <ArrowRight className="w-4 h-4" />}
          </Button>
        </form>

        {/* Visual Divider */}
        <div className="relative flex items-center my-6">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-4 text-slate-400 text-[10px] uppercase tracking-wider font-semibold">
            Or continue with
          </span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        {/* Social Authentication Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Google Button */}
          <button
            type="button"
            onClick={() => handleSocialLogin("google")}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-2 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition-all duration-150 cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.642 1.09 14.973 0 12 0 7.354 0 3.307 2.67 1.242 6.56l4.024 3.205z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.275c0-.825-.074-1.62-.21-2.385H12v4.51h6.47c-.278 1.455-1.1 2.69-2.33 3.513l3.626 2.81c2.122-1.954 3.73-4.83 3.73-8.638z"
              />
              <path
                fill="#FBBC05"
                d="M5.266 14.235L1.242 17.44C3.307 21.33 7.354 24 12 24c2.973 0 5.642-1.09 7.664-2.972l-3.626-2.81c-1.1.737-2.5 1.173-4.038 1.173-3.797 0-7.009-2.56-8.156-6.136z"
              />
              <path
                fill="#34A853"
                d="M1.242 6.56C.446 8.16 0 9.97 0 11.97s.446 3.81 1.242 5.41l5.266-4.145c-.276-.855-.434-1.77-.434-2.715s.158-1.86.434-2.715L1.242 6.56z"
              />
            </svg>
            <span>Google</span>
          </button>

          {/* Facebook Button */}
          <button
            type="button"
            onClick={() => handleSocialLogin("facebook")}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-2 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition-all duration-150 cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4 shrink-0 text-[#1877F2] fill-current" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Facebook</span>
          </button>
        </div>

      </div>
    </div>
  );
}
