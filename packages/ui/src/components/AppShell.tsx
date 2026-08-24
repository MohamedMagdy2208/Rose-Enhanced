import { useState, type ReactNode } from "react";
import {
  Activity,
  Bot,
  BookOpenCheck,
  Boxes,
  ChartNoAxesCombined,
  Dices,
  Gauge,
  Menu,
  MonitorUp,
  PlugZap,
  Settings,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  X,
} from "lucide-react";
import type { ConnectionStatus } from "@summonerkit/contracts";
import { StatusPill } from "./StatusPill";

export type AppSurface = "desktop" | "client" | "mobile";
export type PageId = "dashboard" | "collection" | "insights" | "automation" | "aram" | "integrations" | "mobile" | "doctor" | "guide" | "settings";

const navItems: Array<{ id: PageId; label: string; icon: typeof Gauge; desktopOnly?: boolean }> = [
  { id: "dashboard", label: "Overview", icon: Gauge },
  { id: "collection", label: "Collection", icon: Boxes },
  { id: "insights", label: "Runes & Performance", icon: ChartNoAxesCombined },
  { id: "automation", label: "Automation", icon: Bot },
  { id: "aram", label: "ARAM", icon: Dices },
  { id: "integrations", label: "Integrations", icon: PlugZap, desktopOnly: true },
  { id: "mobile", label: "Mobile Control", icon: Smartphone, desktopOnly: true },
  { id: "doctor", label: "Connection Doctor", icon: Stethoscope, desktopOnly: true },
  { id: "guide", label: "Guide & Updates", icon: BookOpenCheck, desktopOnly: true },
  { id: "settings", label: "Diagnostics", icon: Settings, desktopOnly: true },
];

function statusTone(status: ConnectionStatus) {
  if (status === "connected") return "positive" as const;
  if (status === "degraded") return "warning" as const;
  if (status === "disconnected") return "danger" as const;
  return "neutral" as const;
}

export function AppShell({
  activePage,
  onPageChange,
  surface,
  connectionStatus,
  phase,
  onOpenDesktop,
  children,
}: {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  surface: AppSurface;
  connectionStatus: ConnectionStatus;
  phase: string;
  onOpenDesktop: (() => void) | null;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const visiblePageIds = new Set(navigationForSurface(surface));
  const visibleItems = navItems.filter((item) => visiblePageIds.has(item.id));

  const selectPage = (page: PageId) => {
    onPageChange(page);
    setMenuOpen(false);
  };

  return (
    <div className={`app-shell app-shell--${surface}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="mobile-header">
        <button
          className="icon-button"
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <Brand compact />
        <span className={`connection-dot connection-dot--${connectionStatus}`} aria-hidden="true" />
      </header>

      <aside className={`sidebar${menuOpen ? " sidebar--open" : ""}`} aria-label="Primary navigation">
        <Brand />
        {surface === "client" ? <div className="surface-badge"><span>Inside Rose</span><small>Desktop-backed panel</small></div> : null}
        <nav className="sidebar__nav">
          {visibleItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item${activePage === id ? " nav-item--active" : ""}`}
              aria-current={activePage === id ? "page" : undefined}
              onClick={() => selectPage(id)}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__status">
          <div className="sidebar__status-heading">
            <Activity size={16} aria-hidden="true" />
            <span>League client</span>
          </div>
          <StatusPill tone={statusTone(connectionStatus)}>{connectionStatus}</StatusPill>
          <small title={phase}>{phase || "No active session"}</small>
        </div>

        {surface === "client" && onOpenDesktop ? (
          <button className="sidebar__desktop-button" type="button" onClick={onOpenDesktop}>
            <MonitorUp size={16} aria-hidden="true" />
            <span>Open desktop app</span>
          </button>
        ) : null}

        <footer className="sidebar__footer">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>{surface === "client" ? "Engine stays on this PC" : "Local & private"}</span>
        </footer>
      </aside>

      {menuOpen ? (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <main id="main-content" className="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export function navigationForSurface(surface: AppSurface): PageId[] {
  return navItems
    .filter((item) => !(item.desktopOnly && surface !== "desktop"))
    .map((item) => item.id);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`} aria-label="SummonerKit by Mohamed Magdy">
      <span className="brand__mark" aria-hidden="true">
        <span>SK</span>
      </span>
      {!compact ? (
        <span className="brand__copy">
          <strong>SummonerKit</strong>
          <small>by Mohamed Magdy</small>
        </span>
      ) : null}
    </div>
  );
}
