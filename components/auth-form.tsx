"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { playSfxAndWait, primeSfx, useErrorSfx } from "@/lib/client/sfx";
import { getStaticEmailAuthRedirectUrl } from "@/utils/auth-redirect";
import { createClient } from "@/utils/supabase/client";

type AuthFormProps = {
  variant?: "page" | "popup";
  initialStatus?: string | null;
  onSuccess?: () => void;
};

export function AuthForm({
  variant = "page",
  initialStatus = null,
  onSuccess,
}: AuthFormProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailAuth = async (event: FormEvent) => {
    event.preventDefault();
    primeSfx();
    setIsLoading(true);
    setStatus(null);

    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getStaticEmailAuthRedirectUrl(variant),
        },
      });
      if (error) {
        setStatus(error.message);
        setIsLoading(false);
        return;
      }
      if (data.session) {
        await playSfxAndWait("welcome");
        setIsLoading(false);
        onSuccess?.();
        return;
      }
      setStatus("Check your email to confirm your account, then sign in.");
      setMode("signin");
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus(error.message);
      setIsLoading(false);
      return;
    }

    await playSfxAndWait("welcome");
    setIsLoading(false);
    onSuccess?.();
  };

  const statusKind =
    status?.includes("confirm") || status?.includes("created") ? "success" : "error";
  useErrorSfx(statusKind === "error" ? status : null);

  return (
    <div className="app-stack">
      <header className="brand">
        <div className="brand-row">
          <PodLogo />
          <div className="brand-name">
            <span className="peer">Pair</span>
            <span className="pod">Pod</span>
          </div>
        </div>
        <p className="brand-tagline">
          {mode === "signin" ? "welcome back to your pod" : "start a fresh pod"}
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          className={`tab ${mode === "signin" ? "active" : ""}`}
          onClick={() => {
            setMode("signin");
            setStatus(null);
          }}
        >
          Sign In
        </button>
        <button
          type="button"
          className={`tab ${mode === "signup" ? "active" : ""}`}
          onClick={() => {
            setMode("signup");
            setStatus(null);
          }}
        >
          Register
        </button>
      </div>

      <GoogleSignInButton
        variant={variant}
        disabled={isLoading}
        onStart={() => {
          primeSfx();
          setIsLoading(true);
          setStatus(null);
        }}
        onError={(message) => {
          setStatus(message);
          setIsLoading(false);
        }}
        onSuccess={() => {
          setStatus(null);
          void (async () => {
            await playSfxAndWait("welcome");
            setIsLoading(false);
            onSuccess?.();
          })();
        }}
      />

      <div className="divider">
        <span>or use email</span>
      </div>

      <form className="app-stack" onSubmit={(event) => void handleEmailAuth(event)}>
        <label className="form-group">
          <span className="form-label">Email Address</span>
          <span className="input-wrap">
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="form-input"
              placeholder="you@example.com"
            />
            <EmailIcon />
          </span>
        </label>

        <label className="form-group">
          <span className="form-label">Password</span>
          <span className="input-wrap">
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="form-input"
              placeholder="Password"
            />
            <LockIcon />
          </span>
        </label>

        {status ? (
          <p className={`status-note status-note--${statusKind}`}>{status}</p>
        ) : null}

        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading
            ? "Please wait..."
            : mode === "signin"
              ? "Sign in with email"
              : "Create account with email"}
        </button>
      </form>

      <p className="status-note text-center">
        {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setStatus(null);
          }}
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

function PodLogo() {
  return (
    <svg className="logo-pod" viewBox="0 0 38 44" fill="none" aria-hidden="true">
      <path d="M19 6 Q15 1 11 0 Q14 4 14 8" stroke="#3a7820" strokeWidth="1.5" fill="#4a9e2a" strokeLinecap="round" />
      <path d="M19 6 Q23 0 28 0 Q24 4 24 9" stroke="#3a7820" strokeWidth="1.5" fill="#6ebe44" strokeLinecap="round" />
      <line x1="19" y1="10" x2="19" y2="6" stroke="#3a7820" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="19" cy="27" rx="16" ry="16" fill="#6ebe44" stroke="#3d8e22" strokeWidth="1.2" />
      <ellipse cx="17" cy="23" rx="10" ry="11" fill="white" opacity="0.25" />
      <circle cx="14" cy="25" r="3.5" fill="white" stroke="#3d8e22" strokeWidth="0.6" />
      <circle cx="24" cy="25" r="3.5" fill="white" stroke="#3d8e22" strokeWidth="0.6" />
      <circle cx="14.8" cy="25.5" r="1.8" fill="#1a2a44" />
      <circle cx="24.8" cy="25.5" r="1.8" fill="#1a2a44" />
      <path d="M15 32 Q19 36 23 32" stroke="#2d5018" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 5 9-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}
