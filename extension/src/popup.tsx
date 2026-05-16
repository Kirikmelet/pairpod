"use client";
import { createRoot } from "react-dom/client";
<<<<<<< HEAD
import Page from "@/app/page";
=======
import { HomePage } from "../../components/home-page";
>>>>>>> 0867855824eb8311e2cd24ecc2e3a5dc58bb60c5

type ExtensionRuntimeApi = {
  runtime: {
    getURL(path: string): string;
  };
  tabs: {
    create(input: { url: string }): void;
  };
};

const globalWithExtensionApis = globalThis as typeof globalThis & {
  browser?: ExtensionRuntimeApi;
  chrome?: ExtensionRuntimeApi;
};

const runtime = globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element in popup.html");
}

if (!runtime) {
  throw new Error("Missing browser extension runtime APIs");
}

createRoot(rootElement).render(
<<<<<<< HEAD
  <div>
    <Page />
    <button
      onClick={() => {
        const appUrl = runtime.runtime.getURL("app/index.html");
        runtime.tabs.create({ url: appUrl });
      }}
    >
      Open
    </button>
  </div>,
=======
  <HomePage
    variant="popup"
    onOpenApp={() => {
      const appUrl = runtime.runtime.getURL("app/index.html");
      runtime.tabs.create({ url: appUrl });
    }}
  />,
>>>>>>> 0867855824eb8311e2cd24ecc2e3a5dc58bb60c5
);
