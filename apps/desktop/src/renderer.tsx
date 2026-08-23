import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RoseEnhancedApp, emptySnapshot } from "@rose-enhanced/ui";

const container = document.getElementById("root");
if (!container) throw new Error("Renderer root element was not found.");

const initialSnapshot = await window.roseEnhanced.getSnapshot().catch(() => emptySnapshot);

createRoot(container, {
  onUncaughtError: (error) => console.error("Uncaught renderer error", error),
  onRecoverableError: (error) => console.warn("Recoverable renderer error", error),
}).render(
  <StrictMode>
    <RoseEnhancedApp bridge={window.roseEnhanced} initialSnapshot={initialSnapshot} surface="desktop" />
  </StrictMode>,
);
