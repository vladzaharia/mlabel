import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { initThemeBridge } from "./lib/theme";
import "./styles.css";

initThemeBridge();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
