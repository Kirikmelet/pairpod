"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthForm } from "@/components/auth-form";
import { TodosApp } from "@/components/todos-app";
import { createClient } from "@/utils/supabase/client";

type HomePageProps = {
  variant?: "page" | "popup";
  onOpenApp?: () => void;
};

export function HomePage({ variant = "page", onOpenApp }: HomePageProps) {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authError =
    searchParams.get("error") === "auth"
      ? (searchParams.get("message") ?? "Sign in failed. Please try again.")
      : null;

  const refreshUser = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setUser(null);
      return;
    }
    setUser(data.user);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };

  const isPopup = variant === "popup";

  if (isLoading) {
    return (
      <div
        className={
          isPopup
            ? "flex w-[320px] items-center justify-center bg-background p-8 text-sm text-zinc-500"
            : "flex min-h-full items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-black"
        }
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={
          isPopup
            ? "flex w-[320px] flex-col gap-4 bg-background p-4 text-foreground"
            : "flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black"
        }
      >
        <AuthForm
          variant={variant}
          initialStatus={authError}
          onSuccess={() => void refreshUser()}
        />
      </div>
    );
  }

  return (
    <div
      className={
        isPopup
          ? "flex w-[320px] flex-col gap-2 bg-background p-4 text-foreground"
          : "flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black"
      }
    >
      <div
        className={
          isPopup
            ? "flex w-full items-center justify-between gap-2 pb-1"
            : "mb-4 flex w-full max-w-lg items-center justify-between gap-4"
        }
      >
        <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
          {user.email}
          {user.app_metadata?.provider === "google" ? " · Google" : null}
        </p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="shrink-0 text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          Sign out
        </button>
      </div>
      <TodosApp variant={variant} onOpenApp={onOpenApp} />
    </div>
  );
}
