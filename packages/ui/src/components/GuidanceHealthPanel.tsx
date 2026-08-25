import { Activity, Clock3, Database, ShieldCheck, TriangleAlert } from "lucide-react";
import type { GuidanceFeedHealth } from "@summonerkit/contracts";
import { StatusPill } from "./StatusPill";
import { formatRelativeTime } from "../utils/assets";

export function GuidanceHealthPanel({ health }: { health: GuidanceFeedHealth }) {
  const healthy = health.status === "healthy";
  const checking = health.status === "checking";
  const available = health.status !== "idle" && health.status !== "unavailable";
  return (
    <section className={`panel panel--wide guidance-health guidance-health--${health.status}`} aria-labelledby="guidance-health-title">
      <div className="guidance-health__summary">
        <span className="guidance-health__icon" aria-hidden="true">
          {healthy ? <ShieldCheck size={21} /> : checking ? <Activity size={21} /> : <TriangleAlert size={21} />}
        </span>
        <div>
          <p className="eyebrow">Online guidance health</p>
          <h2 id="guidance-health-title">{healthHeadline(health)}</h2>
          <p>{healthDescription(health)}</p>
        </div>
        <StatusPill tone={healthy ? "positive" : checking ? "accent" : available ? "warning" : "danger"}>{health.status}</StatusPill>
      </div>
      <dl className="guidance-health__metrics">
        <div><dt><Database size={13} /> Provider</dt><dd>{health.providerName ?? "Not published"}</dd></div>
        <div><dt><Clock3 size={13} /> Generated</dt><dd>{health.generatedAt ? formatRelativeTime(health.generatedAt) : "No successful feed"}</dd></div>
        <div><dt>Coverage</dt><dd>{health.coverage.champions} champions · {health.coverage.recommendations} rune pages · {health.coverage.builds} builds</dd></div>
        <div><dt>Current patch</dt><dd>{health.currentPatch ?? "Waiting for League"} · {health.currentPatchCovered === null ? "not checked" : health.currentPatchCovered ? "covered" : "fallback only"}</dd></div>
      </dl>
      <footer className="guidance-health__footer">
        <span>{health.observationCount === null ? "Observation count unavailable" : `${health.observationCount.toLocaleString()} anonymous observations`}{health.cohortSize === null ? "" : ` · ${health.cohortSize.toLocaleString()} cohort players`}</span>
        {health.endpoint ? <code title={health.endpoint}>{health.endpoint}</code> : null}
        {health.lastError ? <strong>{health.lastError}</strong> : null}
      </footer>
    </section>
  );
}

function healthHeadline(health: GuidanceFeedHealth): string {
  if (health.status === "healthy") return "Fresh aggregate evidence is available";
  if (health.status === "checking") return "Checking the published feed";
  if (health.status === "degraded" && health.source === "cache") return "Cached guidance is keeping the coach available";
  if (health.status === "degraded") return "Guidance is available with limitations";
  if (health.status === "unavailable") return "The online feed is not available";
  return "Online guidance has not been checked yet";
}

function healthDescription(health: GuidanceFeedHealth): string {
  if (health.status === "healthy") return "The provider passed schema, freshness, patch, and coverage checks.";
  if (health.status === "checking") return "Existing cached recommendations remain visible until this check finishes.";
  if (health.source === "cache") return "The last valid snapshot is read-only and clearly marked stale while the endpoint recovers.";
  if (health.lastError) return "Local performance remains available; runes, builds, and draft evidence need the hosted publisher.";
  return "Publish the first-party aggregate feed to activate online runes, builds, and draft evidence.";
}
