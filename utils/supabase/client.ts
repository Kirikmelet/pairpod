import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { getSupabasePublicConfig } from "./config";

export type AppDatabase = Omit<Database, "__InternalSupabase">;
type AppBrowserClient = SupabaseClient<Database>;

type ExtensionStorageArea = {
  get(
    key: string,
    callback?: (items: Record<string, unknown>) => void,
  ): Promise<Record<string, unknown>> | void;
  remove(key: string, callback?: () => void): Promise<void> | void;
  set(items: Record<string, string>, callback?: () => void): Promise<void> | void;
};

type ExtensionRuntime = {
  runtime?: {
    lastError?: {
      message?: string;
    };
  };
  storage?: {
    local?: ExtensionStorageArea;
  };
};

type SupabaseStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

type SupabaseClientCache = {
  client: AppBrowserClient;
  cacheKey: string;
};

const globalWithExtensionApis = globalThis as typeof globalThis & {
  browser?: ExtensionRuntime;
  chrome?: ExtensionRuntime;
  __pairpodSupabaseClient?: SupabaseClientCache;
};

export const createClient = (): AppBrowserClient => {
  const { url, key } = getSupabasePublicConfig(
    "utils/supabase/client.ts createClient()",
  );
  const extensionStorage = createExtensionStorageAdapter();
  const cacheKey = `${url}:${key}:${extensionStorage ? "extension" : "browser"}`;

  if (globalWithExtensionApis.__pairpodSupabaseClient?.cacheKey === cacheKey) {
    return globalWithExtensionApis.__pairpodSupabaseClient.client;
  }

  if (extensionStorage) {
    const client = createSupabaseClient<Database>(url, key, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: extensionStorage,
      },
    }) as unknown as AppBrowserClient;

    globalWithExtensionApis.__pairpodSupabaseClient = { cacheKey, client };
    return client;
  }

  const client = createBrowserClient<Database>(url, key) as unknown as AppBrowserClient;
  globalWithExtensionApis.__pairpodSupabaseClient = { cacheKey, client };
  return client;
};

export function getSupabaseBrowserAuthConfig() {
  const { url, key } = getSupabasePublicConfig(
    "utils/supabase/client.ts getSupabaseBrowserAuthConfig()",
  );

  return {
    key,
    storageKey: getSupabaseAuthStorageKey(url),
    url,
  };
}

export async function completeClientSideAuthRedirect() {
  if (typeof window === "undefined") {
    return false;
  }

  const supabase = createClient();
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }

    clearAuthRedirectParams(url);
    return true;
  }

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }

    clearAuthRedirectParams(url);
    return true;
  }

  return false;
}

function getSupabaseAuthStorageKey(url: string) {
  const projectRef = new URL(url).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function createExtensionStorageAdapter(): SupabaseStorageAdapter | null {
  const runtime =
    globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;
  const storage = runtime?.storage?.local;

  if (!storage) {
    return null;
  }

  return {
    async getItem(key) {
      const items = await extensionStorageGet(runtime, (callback) =>
        storage.get(key, callback),
      );
      const value = items?.[key];
      return typeof value === "string" ? value : null;
    },
    async removeItem(key) {
      await extensionStorageMutation(runtime, (callback) =>
        storage.remove(key, callback),
      );
    },
    async setItem(key, value) {
      await extensionStorageMutation(runtime, (callback) =>
        storage.set({ [key]: value }, callback),
      );
    },
  };
}

async function extensionStorageGet(
  runtime: ExtensionRuntime,
  call: (
    callback: (value: Record<string, unknown>) => void,
  ) => Promise<Record<string, unknown>> | void,
) {
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const maybePromise = call((value) => {
      const message = runtime.runtime?.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }

      resolve(value);
    });

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve, reject);
    }
  });
}

async function extensionStorageMutation(
  runtime: ExtensionRuntime,
  call: (callback: () => void) => Promise<void> | void,
) {
  await new Promise<void>((resolve, reject) => {
    const maybePromise = call(() => {
      const message = runtime.runtime?.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }

      resolve();
    });

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve, reject);
    }
  });
}

function clearAuthRedirectParams(url: URL) {
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState(null, "", url.toString());
}
