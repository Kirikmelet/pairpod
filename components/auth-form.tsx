"use client";

import { useState } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
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

  const isPopup = variant === "popup";

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setStatus(null);

    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setStatus(error.message);
        setIsLoading(false);
        return;
      }
      if (data.session) {
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

    setIsLoading(false);
    onSuccess?.();
  };

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600";
  const buttonClass =
    "rounded-full px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50";

  return (
    <div
      className={
        isPopup
          ? "flex w-full flex-col gap-3"
          : "flex w-full max-w-lg flex-col gap-6 rounded-3xl bg-white p-8 shadow-sm dark:bg-zinc-950"
      }
    >
      <header className="flex flex-col gap-1">
        <h1
          className={
            isPopup
              ? "text-base font-semibold"
              : "text-3xl font-semibold tracking-tight text-black dark:text-zinc-50"
          }
        >
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {mode === "signin"
            ? "Welcome back to Uncommon Hacks"
            : "Create an account to get started"}
        </p>
      </header>

      <GoogleSignInButton variant={variant} disabled={isLoading} />

      {isPopup ? (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          Sign in opens in a new tab. Reload the extension when finished.
        </p>
      ) : null}

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or use email
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <form className="grid gap-3" onSubmit={(e) => void handleEmailAuth(e)}>
        <label className="grid gap-1.5 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Password</span>
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {status ? (
          <p
            className={`text-sm ${status.includes("confirm") || status.includes("created") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            {status}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className={`${buttonClass} bg-foreground font-semibold text-background hover:opacity-90`}
        >
          {isLoading
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in with email"
              : "Create account with email"}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="font-medium text-foreground underline-offset-2 hover:underline"
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
