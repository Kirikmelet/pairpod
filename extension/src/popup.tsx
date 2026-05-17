"use client";
import { createRoot } from "react-dom/client";
import { HomePage } from "../../components/home-page";
import "./popup.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element in popup.html");
}

createRoot(rootElement).render(<HomePage variant="popup" />);
