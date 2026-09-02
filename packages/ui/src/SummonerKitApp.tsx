import { useState } from "react";
import type { CompanionBridge, CompanionCommand, CompanionSnapshot } from "@summonerkit/contracts";
import { AppShell, navigationForSurface, type AppSurface, type PageId } from "./components/AppShell";
import { BridgeProvider, useCompanionSnapshot, useCompanionCommand, useCompanionBridge } from "./bridge/bridge-context";
import { AutomationPage } from "./pages/AutomationPage";
import { AramPage } from "./pages/AramPage";
import { CollectionPage } from "./pages/CollectionPage";
import { ConnectionDoctorPage } from "./pages/ConnectionDoctorPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { InsightsPage } from "./pages/InsightsPage";
import { GuideUpdatesPage } from "./pages/GuideUpdatesPage";
import { MobileControlPage } from "./pages/MobileControlPage";
import { ClientMobileControlPage } from "./pages/ClientMobileControlPage";
import { SetupPage } from "./pages/SetupPage";
import { TestLabPage } from "./pages/TestLabPage";

const onboardingStorageKey = "summonerkit:onboarding-complete:v1";
const pageStorageKey = (surface: AppSurface) => `summonerkit:last-page:${surface}:v1`;

function initialPage(surface: AppSurface): PageId {
  try {
    return resolveInitialPage(
      surface,
      window.localStorage.getItem(onboardingStorageKey) === "true",
      window.localStorage.getItem(pageStorageKey(surface)),
    );
  } catch {
    return resolveInitialPage(surface, false, null);
  }
}

export function resolveInitialPage(surface: AppSurface, onboardingComplete: boolean, storedPage: string | null): PageId {
  if (surface === "desktop" && !onboardingComplete) return "setup";
  const pages = navigationForSurface(surface);
  return storedPage && pages.includes(storedPage as PageId) ? storedPage as PageId : "dashboard";
}

export function SummonerKitApp({ bridge, initialSnapshot, surface = "desktop" }: { bridge: CompanionBridge; initialSnapshot: CompanionSnapshot; surface?: AppSurface }) {
  return <BridgeProvider bridge={bridge} initialSnapshot={initialSnapshot}><App surface={surface} /></BridgeProvider>;
}

function App({ surface }: { surface: AppSurface }) {
  const snapshot = useCompanionSnapshot();
  const dispatch = useCompanionCommand();
  const bridge = useCompanionBridge();
  const [page, setPage] = useState<PageId>(() => initialPage(surface));
  const [message, setMessage] = useState("");

  const onCommand = async (command: CompanionCommand) => {
    const result = await dispatch(command);
    setMessage(result.message);
    window.setTimeout(() => setMessage(""), 4_000);
  };

  const navigate = (nextPage: PageId) => {
    if (!navigationForSurface(surface).includes(nextPage)) return;
    setPage(nextPage);
    try { window.localStorage.setItem(pageStorageKey(surface), nextPage); }
    catch { /* Navigation remains available when storage is unavailable. */ }
  };

  return (
    <AppShell activePage={page} onPageChange={navigate} surface={surface} connectionStatus={snapshot.connection.status} phase={snapshot.connection.phase} onOpenDesktop={surface === "client" ? () => void onCommand({ type: "desktop.open" }) : null}>
      {message ? <div className="toast" role="status">{message}</div> : null}
      {page === "setup" && surface === "desktop" ? <SetupPage snapshot={snapshot} onCommand={onCommand} onNavigate={navigate} onComplete={() => { try { window.localStorage.setItem(onboardingStorageKey, "true"); } catch { /* Keep setup usable when storage is unavailable. */ } navigate("dashboard"); }} /> : null}
      {page === "dashboard" ? <DashboardPage snapshot={snapshot} onNavigate={navigate} onCommand={onCommand} canConfigureMobile={surface === "desktop"} /> : null}
      {page === "collection" ? <CollectionPage collection={snapshot.collection} phase={snapshot.connection.phase} onCommand={onCommand} /> : null}
      {page === "insights" ? <InsightsPage snapshot={snapshot} onCommand={onCommand} /> : null}
      {page === "automation" ? <AutomationPage snapshot={snapshot} surface={surface} onCommand={onCommand} /> : null}
      {page === "aram" ? <AramPage snapshot={snapshot} onCommand={onCommand} /> : null}
      {page === "integrations" && surface === "desktop" ? <IntegrationsPage integrations={snapshot.integrations} onCommand={onCommand} /> : null}
      {page === "mobile" ? surface === "desktop" ? <MobileControlPage snapshot={snapshot} bridge={bridge} onCommand={onCommand} /> : <ClientMobileControlPage snapshot={snapshot} onCommand={onCommand} /> : null}
      {page === "doctor" && surface === "desktop" ? <ConnectionDoctorPage snapshot={snapshot} onCommand={onCommand} /> : null}
      {page === "guide" && surface === "desktop" ? <GuideUpdatesPage bridge={bridge} /> : null}
      {page === "testlab" && surface === "desktop" ? <TestLabPage snapshot={snapshot} /> : null}
      {page === "settings" && surface === "desktop" ? <DiagnosticsPage snapshot={snapshot} /> : null}
    </AppShell>
  );
}
