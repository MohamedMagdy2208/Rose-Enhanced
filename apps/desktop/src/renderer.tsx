import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SummonerKitApp, emptySnapshot } from "@summonerkit/ui";

const container = document.getElementById("root");
if (!container) throw new Error("Renderer root element was not found.");

const root = createRoot(container, {
  onUncaughtError: (error) => console.error("Uncaught renderer error", error),
  onRecoverableError: (error) => console.warn("Recoverable renderer error", error),
});
const bridge = window.summonerKit;

if (!bridge) {
  console.error("SummonerKit renderer: secure desktop bridge unavailable.");
  root.render(
    <main className="renderer-status" role="alert">
      <span className="renderer-status__mark" aria-hidden="true">SK</span>
      <p className="eyebrow">Desktop recovery</p>
      <h1>SummonerKit couldn’t start its interface.</h1>
      <p>The local engine can keep running. Restart SummonerKit from its tray icon to repair the desktop window.</p>
    </main>,
  );
} else {
  const initialSnapshot = await bridge.getSnapshot().catch(() => emptySnapshot);
  root.render(
    <StrictMode>
      <SummonerKitApp bridge={bridge} initialSnapshot={initialSnapshot} surface="desktop" />
    </StrictMode>,
  );
}
