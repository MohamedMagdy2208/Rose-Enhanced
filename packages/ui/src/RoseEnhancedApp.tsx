import { useState } from "react";
import type { CompanionBridge, CompanionCommand, CompanionSnapshot } from "@rose-enhanced/contracts";
import { AppShell, type AppSurface, type PageId } from "./components/AppShell";
import { BridgeProvider, useCompanionSnapshot, useCompanionCommand, useCompanionBridge } from "./bridge/bridge-context";
import { AutomationPage } from "./pages/AutomationPage";
import { AramPage } from "./pages/AramPage";
import { CollectionPage } from "./pages/CollectionPage";
import { ConnectionDoctorPage } from "./pages/ConnectionDoctorPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { InsightsPage } from "./pages/InsightsPage";
import { MobileControlPage } from "./pages/MobileControlPage";

export function RoseEnhancedApp({ bridge, initialSnapshot, surface = "desktop" }: { bridge: CompanionBridge; initialSnapshot: CompanionSnapshot; surface?: AppSurface }) {
  return <BridgeProvider bridge={bridge} initialSnapshot={initialSnapshot}><App surface={surface} /></BridgeProvider>;
}

function App({ surface }: { surface: AppSurface }) {
  const snapshot = useCompanionSnapshot();
  const dispatch = useCompanionCommand();
  const bridge = useCompanionBridge();
  const [page, setPage] = useState<PageId>("dashboard");
  const [message, setMessage] = useState("");

  const onCommand = async (command: CompanionCommand) => {
    const result = await dispatch(command);
    setMessage(result.message);
    window.setTimeout(() => setMessage(""), 4_000);
  };

  return (
    <AppShell activePage={page} onPageChange={setPage} surface={surface} connectionStatus={snapshot.connection.status} phase={snapshot.connection.phase} onOpenDesktop={surface === "client" ? () => void onCommand({ type: "desktop.open" }) : null}>
      {message ? <div className="toast" role="status">{message}</div> : null}
      {page === "dashboard" ? <DashboardPage snapshot={snapshot} onNavigate={setPage} onCommand={onCommand} /> : null}
      {page === "collection" ? <CollectionPage collection={snapshot.collection} phase={snapshot.connection.phase} onCommand={onCommand} /> : null}
      {page === "insights" ? <InsightsPage snapshot={snapshot} onCommand={onCommand} /> : null}
      {page === "automation" ? <AutomationPage snapshot={snapshot} surface={surface} onCommand={onCommand} /> : null}
      {page === "aram" ? <AramPage snapshot={snapshot} onCommand={onCommand} /> : null}
      {page === "integrations" && surface === "desktop" ? <IntegrationsPage integrations={snapshot.integrations} onCommand={onCommand} /> : null}
      {page === "mobile" && surface === "desktop" ? <MobileControlPage snapshot={snapshot} bridge={bridge} onCommand={onCommand} /> : null}
      {page === "doctor" && surface === "desktop" ? <ConnectionDoctorPage snapshot={snapshot} onCommand={onCommand} /> : null}
      {page === "settings" && surface === "desktop" ? <DiagnosticsPage snapshot={snapshot} /> : null}
    </AppShell>
  );
}
