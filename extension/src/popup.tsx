import { createRoot } from "react-dom/client";
import { TodosApp } from "../../components/todos-app";

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
  <TodosApp
    variant="popup"
    onOpenApp={() => {
      const appUrl = runtime.runtime.getURL("app/index.html");
      runtime.tabs.create({ url: appUrl });
    }}
  />,
);
