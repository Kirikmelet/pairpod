import { createRoot } from "react-dom/client";
import { TodosApp } from "../../components/todos-app";

const runtime = globalThis.browser ?? globalThis.chrome;
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element in popup.html");
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
