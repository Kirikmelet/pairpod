"use client";
import { createRoot } from "react-dom/client";
import Page from "@/app/page";

const runtime = globalThis.browser ?? globalThis.chrome;
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element in popup.html");
}

createRoot(rootElement).render(
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
);
