"use client";

import { GOOGLE_LOGIN_PATH } from "@/utils/auth-redirect";
import {
  createClient,
  getSupabaseBrowserAuthConfig,
} from "@/utils/supabase/client";

type GoogleSignInButtonProps = {
  variant?: "page" | "popup";
  disabled?: boolean;
  className?: string;
  onError?: (message: string) => void;
  onStart?: () => void;
  onSuccess?: () => void;
};

type ExtensionRuntimeApi = {
  identity?: {
    getRedirectURL(path?: string): string;
    launchWebAuthFlow(
      details: { interactive: boolean; url: string },
      callback?: (responseUrl?: string) => void,
    ): Promise<string | undefined> | void;
  };
  runtime?: {
    lastError?: {
      message?: string;
    };
    sendMessage(
      message: GoogleAuthMessage,
      callback?: (response?: GoogleAuthResponse) => void,
    ): Promise<GoogleAuthResponse | undefined> | void;
  };
  tabs?: {
    create(input: { url: string }): void;
  };
};

type GoogleAuthMessage = {
  authUrl: string;
  storageKey: string;
  supabaseKey: string;
  supabaseUrl: string;
  type: "peerpod.googleAuth";
};

type GoogleAuthResponse =
  | {
      ok: true;
    }
  | {
      error?: string;
      ok: false;
    };

const globalWithExtensionApis = globalThis as typeof globalThis & {
  browser?: ExtensionRuntimeApi;
  chrome?: ExtensionRuntimeApi;
};

export function GoogleSignInButton({
  variant = "page",
  disabled = false,
  className = "",
  onError,
  onStart,
  onSuccess,
}: GoogleSignInButtonProps) {
  const handlePopupClick = async () => {
    const runtime =
      globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;

    if (!runtime?.identity || !runtime.runtime?.sendMessage) {
      onError?.("This browser does not expose the extension identity API.");
      return;
    }

    onStart?.();

    try {
      const supabase = createClient();
      const { key, storageKey, url } = getSupabaseBrowserAuthConfig();
      const redirectTo = runtime.identity.getRedirectURL("auth/callback");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error("Google did not return a sign-in URL.");
      }

      const response = await runGoogleAuthInBackground(runtime, {
        authUrl: data.url,
        storageKey,
        supabaseKey: key,
        supabaseUrl: url,
        type: "peerpod.googleAuth",
      });

      if (!response?.ok) {
        throw new Error(response?.error ?? "Google sign-in failed.");
      }

      onSuccess?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Google sign-in failed.";
      onError?.(message);
    }
  };

  const baseClass = "btn-social";

  if (variant === "popup") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={handlePopupClick}
        className={`${baseClass} ${className}`}
      >
        <GoogleIcon />
        Continue with Google
      </button>
    );
  }

  return (
    <a
      href={GOOGLE_LOGIN_PATH}
      className={`${baseClass} ${className}`}
      aria-disabled={disabled}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
        }
      }}
    >
      <GoogleIcon />
      Continue with Google
    </a>
  );
}

async function runGoogleAuthInBackground(
  runtime: ExtensionRuntimeApi,
  message: GoogleAuthMessage,
) {
  return await new Promise<GoogleAuthResponse | undefined>(
    (resolve, reject) => {
      const maybePromise = runtime.runtime?.sendMessage(message, (response) => {
        const runtimeError = runtime.runtime?.lastError?.message;
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }

        resolve(response);
      });

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve, reject);
      }
    }
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9.14v3.34h4.84c-.1.83-.64 2.08-1.84 2.92l-.03.2 2.68 2.08.19.18c1.73-1.6 2.73-3.96 2.73-6.7z"
      />
      <path
        fill="#34A853"
        d="M9.14 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.52-1.78.88-3.12.88-2.38 0-4.4-1.6-5.12-3.94l-.22.02-2.78 2.15-.06.19C2.87 15.98 5.7 18 9.14 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.56A5.5 5.5 0 0 1 3.7 9c0-.55.1-1.08.28-1.56l.01-.19-2.81-2.19-.18.09A9 9 0 0 0 1 9c0 1.45.35 2.82.98 4.06l2-1.5z"
      />
      <path
        fill="#EA4335"
        d="M9.14 3.58c1.68 0 2.82.73 3.47 1.34l2.53-2.47C13.58 1.1 11.5 0 9.14 0 5.7 0 2.87 2.02 1.98 4.94l2.99 2.32C5.7 5.18 7.72 3.58 9.14 3.58z"
      />
    </svg>
  );
}
