import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Menu,
  MonitorUp,
  ShieldCheck,
  X,
} from "lucide-react";
import { PRODUCT_AUTHOR, PRODUCT_NAME } from "@summonerkit/contracts";
import type { ConnectionStatus } from "@summonerkit/contracts";
import { BrandMark } from "./BrandMark";
import { StatusPill } from "./StatusPill";
import { navigationForSurface, navigationGroups, navigationItems, type AppSurface, type PageId } from "./navigation";

export { navigationForSurface, navigationGroupsForSurface } from "./navigation";
export type { AppSurface, NavigationGroupId, PageId } from "./navigation";

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
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const previousPageRef = useRef(activePage);
  const visiblePageIds = new Set(navigationForSurface(surface));
  const visibleItems = navigationItems.filter((item) => visiblePageIds.has(item.id));
  const visibleGroups = navigationGroups
    .map((group) => ({ ...group, items: visibleItems.filter((item) => item.group === group.id) }))
    .filter((group) => group.items.length > 0);
  const activeItem = visibleItems.find((item) => item.id === activePage) ?? visibleItems[0];
  const activeGroup = navigationGroups.find((group) => group.id === activeItem?.group);

  useEffect(() => {
    if (previousPageRef.current === activePage) return;
    previousPageRef.current = activePage;
    window.scrollTo({ top: 0, behavior: "auto" });
    mainRef.current?.focus({ preventScroll: true });
  }, [activePage]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const selectPage = (page: PageId) => {
    onPageChange(page);
    setMenuOpen(false);
    if (page === activePage) mainRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={`app-shell app-shell--${surface}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="mobile-header">
        <button
          ref={menuButtonRef}
          className="icon-button"
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="mobile-header__identity">
          <Brand compact />
          <span className="mobile-header__context">
            <small>{activeGroup?.label ?? "SummonerKit"}</small>
            <strong>{activeItem?.label ?? "Overview"}</strong>
          </span>
        </div>
        <span className={`connection-dot connection-dot--${connectionStatus}`} aria-label={`League client ${connectionStatus}`} role="status" />
      </header>

      <aside className={`sidebar${menuOpen ? " sidebar--open" : ""}`} aria-label="Primary navigation">
        <Brand />
        {surface === "client" ? <div className="surface-badge"><span>Inside SummonerKit</span><small>League client tab · desktop-backed</small></div> : null}
        <nav className="sidebar__nav" aria-label="Sections">
          {visibleGroups.map((group) => (
            <section className="nav-group" aria-labelledby={`nav-group-${group.id}`} key={group.id}>
              <h2 className="nav-group__label" id={`nav-group-${group.id}`}>{group.label}</h2>
              <div className="nav-group__items">
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`nav-item${activePage === id ? " nav-item--active" : ""}`}
                    aria-current={activePage === id ? "page" : undefined}
                    onClick={() => selectPage(id)}
                  >
                    <span className="nav-item__icon"><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </section>
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
          onClick={() => {
            setMenuOpen(false);
            menuButtonRef.current?.focus();
          }}
        />
      ) : null}

      <main ref={mainRef} id="main-content" className="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`} aria-label={`${PRODUCT_NAME} by ${PRODUCT_AUTHOR}`}>
      <BrandMark className="brand__mark" />
      {!compact ? (
        <span className="brand__copy">
          <strong>{PRODUCT_NAME}</strong>
          <small>by {PRODUCT_AUTHOR}</small>
        </span>
      ) : null}
    </div>
  );
}
