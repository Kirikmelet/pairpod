"use client";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HomePage } from "../../components/home-page";
import "./popup.css";

type ExtensionRuntimeApi = {
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

createRoot(rootElement).render(<PopupRoot />);
