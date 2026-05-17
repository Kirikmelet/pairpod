"use client";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HomePage } from "../../components/home-page";
import { getSupabaseBrowserAuthConfig } from "../../utils/supabase/client";
import "./popup.css";

type ExtensionRuntimeApi = {
  runtime?: {
    getURL?: (path: string) => string;
    lastError?: {
      message?: string;
    };
  };
  storage?: {
    local?: {
      get(
        key: string,
        callback?: (items: Record<string, unknown>) => void,
      ): Promise<Record<string, unknown>> | void;
    };
  };
  tabs?: {
    query(
      queryInfo: { active: boolean; currentWindow: boolean },
      callback?: (tabs: Array<{ title?: string; url?: string }>) => void,
    ): Promise<Array<{ title?: string; url?: string }>> | void;
  };
};

const globalWithExtensionApis = globalThis as typeof globalThis & {
  browser?: ExtensionRuntimeApi;
  chrome?: ExtensionRuntimeApi;
};

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element in popup.html");
}

void bootPopup();

async function bootPopup() {
  try {
    if (!(await shouldOpenStaticLogin())) {
      createRoot(rootElement as HTMLElement).render(<PopupRoot />);
      return;
    }
  } catch {
    openStaticLogin();
    return;
  }

  openStaticLogin();
}

async function shouldOpenStaticLogin() {
  const runtime =
    globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;
  const storage = runtime?.storage?.local;

  if (!storage) {
    return false;
  }

  const { storageKey } = getSupabaseBrowserAuthConfig();
  const sessionValue = await extensionStorageGet(runtime, storage, storageKey);

  if (typeof sessionValue !== "string") {
    return true;
  }

  try {
    const session = JSON.parse(sessionValue) as { access_token?: unknown };
    return typeof session.access_token !== "string" || !session.access_token;
  } catch {
    return true;
  }
}

async function extensionStorageGet(
  runtime: ExtensionRuntimeApi,
  storage: NonNullable<NonNullable<ExtensionRuntimeApi["storage"]>["local"]>,
  key: string,
) {
  return await new Promise<unknown>((resolve, reject) => {
    const maybePromise = storage.get(key, (items) => {
      const message = runtime.runtime?.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }

      resolve(items?.[key]);
    });

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then((items) => resolve(items?.[key]), reject);
    }
  });
}

function openStaticLogin() {
  const runtime =
    globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;
  window.location.href = runtime?.runtime?.getURL?.("login.html") ?? "login.html";
}

function PopupRoot() {
  useEffect(() => {
    if (window.location.hash) {
      return;
    }

    const runtime =
      globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;
    const queryTabs = runtime?.tabs?.query;

    if (!queryTabs) {
      return;
    }

    const applyTabContext = (tabs: Array<{ title?: string; url?: string }>) => {
      const tab = tabs[0];
      if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
        return;
      }

      const params = new URLSearchParams({ url: tab.url });
      if (tab.title) {
        params.set("title", tab.title);
      }

      window.location.hash = `/?${params.toString()}`;
    };

    const maybePromise = queryTabs.call(
      runtime.tabs,
      { active: true, currentWindow: true },
      applyTabContext,
    );

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(applyTabContext).catch(() => {});
    }
  }, []);

  return <HomePage variant="popup" />;
}
