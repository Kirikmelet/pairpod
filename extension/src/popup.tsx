import { createRoot } from "react-dom/client";
import { HomePage } from "../../components/home-page";

const runtime = globalThis.browser ?? globalThis.chrome;
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element in popup.html");
}

createRoot(rootElement).render(
  <HomePage
    variant="popup"
    onOpenApp={() => {
      const appUrl = runtime.runtime.getURL("app/index.html");
      runtime.tabs.create({ url: appUrl });
    }}
  />,
);
