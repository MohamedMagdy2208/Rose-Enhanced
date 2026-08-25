import { useCallback, useEffect, useState } from "react";
import {
  BadgeInfo,
  BookOpenCheck,
  CloudDownload,
  Copyright,
  ExternalLink,
  GitFork,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  PRODUCT_AUTHOR,
  PRODUCT_NAME,
  PRODUCT_URLS,
  type AppUpdateState,
  type CompanionBridge,
} from "@summonerkit/contracts";
import { StatusPill } from "../components/StatusPill";

export function GuideUpdatesPage({ bridge }: { bridge: CompanionBridge }) {
  const { update, checking, actionError, check, restart } = useAppUpdates(bridge);

  return (
    <div className="page guide-page">
      <header className="page-header">
        <p className="eyebrow">Guide & updates</p>
        <h1>Use SummonerKit with confidence.</h1>
        <p className="page-lede">Start here for setup, everyday use, releases, ownership, and the boundaries that keep the companion local and understandable.</p>
      </header>

      <div className="guide-layout">
        <section className="panel update-panel" aria-labelledby="updates-title">
          <div className="panel__header">
            <div><p className="eyebrow">Application updates</p><h2 id="updates-title">GitHub release channel</h2></div>
            <StatusPill tone={updateTone(update?.status)}>{update?.status ?? "Loading"}</StatusPill>
          </div>
          <div className="update-version">
            <CloudDownload size={24} aria-hidden="true" />
            <div><span>Installed version</span><strong>{update?.currentVersion ?? "Reading…"}</strong></div>
            {update?.availableVersion ? <div><span>Available version</span><strong>{update.availableVersion}</strong></div> : null}
          </div>
          <p className="update-message" role="status">{actionError ?? update?.message ?? "Reading update support…"}</p>
          <div className="update-actions">
            {update?.canRestart ? <button className="button button--primary" type="button" onClick={() => void restart()}><RotateCcw size={16} /> Restart to install</button> : null}
            <button className="button button--secondary" type="button" disabled={!update?.canCheck || checking} onClick={() => void check()}><RefreshCw size={16} /> {checking ? "Checking…" : "Check for updates"}</button>
            <a className="button button--ghost" href={PRODUCT_URLS.releases} target="_blank" rel="noreferrer">GitHub Releases <ExternalLink size={15} /></a>
          </div>
          <small className="update-footnote">One-click updates require the Windows Setup installation. Portable and development builds stay manual. Updates are never installed silently.</small>
        </section>

        <section className="panel about-panel" aria-labelledby="about-title">
          <div className="about-mark" aria-hidden="true">SK</div>
          <p className="eyebrow">About</p>
          <h2 id="about-title">{PRODUCT_NAME}</h2>
          <p className="creator-line">Created and maintained by {PRODUCT_AUTHOR}.</p>
          <p>A privacy-first Windows companion with collection, automation, ARAM, mobile control, evidence-based builds, and local performance coaching.</p>
          <div className="about-links">
            <a href={PRODUCT_URLS.source} target="_blank" rel="noreferrer"><GitFork size={15} /> Source code</a>
            <a href={PRODUCT_URLS.license} target="_blank" rel="noreferrer"><Copyright size={15} /> MIT License</a>
          </div>
        </section>

        <section className="panel guide-quickstart" aria-labelledby="quickstart-title">
          <div className="panel__header"><div><p className="eyebrow">First run</p><h2 id="quickstart-title">Recommended startup order</h2></div><BookOpenCheck size={20} aria-hidden="true" /></div>
          <ol>
            <li><strong>Open SummonerKit.</strong><span>Leave it running in the Windows tray so the local bridge and automation engine stay available.</span></li>
            <li><strong>Open Rose only if you use it.</strong><span>Rose remains a separate optional tool. SummonerKit does not bundle or download it.</span></li>
            <li><strong>Open the League client.</strong><span>SummonerKit discovers the running client automatically and repairs its client tab when needed.</span></li>
            <li><strong>Use either surface.</strong><span>The desktop app owns settings and diagnostics; the League tab provides match-adjacent controls.</span></li>
          </ol>
          <a className="button button--secondary" href={PRODUCT_URLS.userGuide} target="_blank" rel="noreferrer">Open the complete user guide <ExternalLink size={15} /></a>
        </section>

        <section className="panel guide-map" aria-labelledby="feature-map-title">
          <div className="panel__header"><div><p className="eyebrow">Feature map</p><h2 id="feature-map-title">Where to find everything</h2></div><BadgeInfo size={20} aria-hidden="true" /></div>
          <dl>
            <div><dt>Collection</dt><dd>Owned skins, chromas, favorites, wishlist, and read-only loot overlap.</dd></div>
            <div><dt>Coach & Builds</dt><dd>Explainable draft choices, aggregate runes and completed builds, local report cards, and patch readiness.</dd></div>
            <div><dt>Automation</dt><dd>Risk acknowledgement, dry-run/confirm modes, profiles, and the audit timeline.</dd></div>
            <div><dt>Mobile Control</dt><dd>Pair a phone after the relay and PWA deployment are configured.</dd></div>
            <div><dt>Connection Doctor</dt><dd>Repair the League tab and understand unavailable client capabilities.</dd></div>
          </dl>
        </section>

        <section className="panel panel--wide legal-summary">
          <ShieldCheck size={22} aria-hidden="true" />
          <div><h2>Copyright © 2026 Mohamed Magdy</h2><p>SummonerKit is available under the MIT License. Third-party projects and Riot Games retain their own names, assets, trademarks, and licenses.</p><p>SummonerKit isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p></div>
        </section>
      </div>
    </div>
  );
}

function useAppUpdates(bridge: CompanionBridge) {
  const [update, setUpdate] = useState<AppUpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!bridge.getUpdateState) return;
    setUpdate(await bridge.getUpdateState());
  }, [bridge]);

  useEffect(() => { void refresh().catch((error) => setActionError(errorMessage(error))); }, [refresh]);
  useEffect(() => {
    if (update?.status !== "checking" && update?.status !== "downloading") return;
    const timer = window.setInterval(() => {
      void refresh().catch((error) => setActionError(errorMessage(error)));
    }, 750);
    return () => window.clearInterval(timer);
  }, [refresh, update?.status]);

  const check = async () => {
    if (!bridge.checkForUpdates) return;
    setChecking(true);
    setActionError(null);
    try { setUpdate(await bridge.checkForUpdates()); }
    catch (error) { setActionError(errorMessage(error)); }
    finally { setChecking(false); }
  };
  const restart = async () => {
    if (!bridge.restartToUpdate) return;
    setActionError(null);
    try { await bridge.restartToUpdate(); }
    catch (error) { setActionError(errorMessage(error)); }
  };
  return { update, checking, actionError, check, restart };
}

function updateTone(status: AppUpdateState["status"] | undefined) {
  if (status === "current") return "positive" as const;
  if (status === "ready") return "accent" as const;
  if (status === "error") return "danger" as const;
  if (status === "checking" || status === "downloading") return "warning" as const;
  return "neutral" as const;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
