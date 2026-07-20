"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@workspace/ui";
import AuthCard from "../../components/auth/AuthCard";
import { errorClass, inputClass, labelClass } from "../../components/auth/formStyles";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform"); // "desktop" when opened from the Amicus desktop app
  const autoProvider = searchParams.get("provider") as "google" | "facebook" | null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Desktop-originated OAuth login (0.9): the desktop app's "Login with
  // Google/Facebook" button opens this page with ?platform=desktop&provider=...
  // — trigger that provider immediately instead of making the user click twice.
  // Password login never reaches this page from the desktop app (0.7 calls the
  // backend API directly), so only the OAuth branch needs the platform check.
  useEffect(() => {
    if (platform === "desktop" && autoProvider) {
      handleSocial(autoProvider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  }

  async function handleSocial(provider: "google" | "facebook") {
    setError("");
    setLoading(true);
    try {
      await signIn(provider, {
        callbackUrl: platform === "desktop" ? "/auth/desktop-complete" : "/",
      });
    } catch {
      setError(`Failed to start ${provider} sign-in`);
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Sign in to Amicus">
      {platform === "desktop" && autoProvider ? (
        <p className="text-center text-sm text-muted-foreground">Opening {autoProvider}…</p>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {error && <div className={errorClass}>{error}</div>}

            <div>
              <label className={labelClass}>Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" disabled={loading} className="mt-2 w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Or continue with
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" type="button" disabled={loading} onClick={() => handleSocial("google")}>
              Google
            </Button>
            <Button variant="outline" type="button" disabled={loading} onClick={() => handleSocial("facebook")}>
              Facebook
            </Button>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href={platform === "desktop" ? "/register?platform=desktop" : "/register"} className="font-medium text-foreground underline">
              Create one
            </a>
          </p>
        </>
      )}
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
