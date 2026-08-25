import { AlertTriangle, Ban, CheckCircle2, MousePointer2 } from "lucide-react";
import type { AutomationProfile, ChampionRecord } from "@summonerkit/contracts";
import { StatusPill } from "./StatusPill";
import { queueName } from "./QueueSelector";

export function profileIssues(profile: AutomationProfile): string[] {
  const issues: string[] = [];
  if (profile.pickPriority.length === 0) issues.push("Auto-pick has no champion priority.");
  if (profile.banPriority.length === 0) issues.push("Auto-ban has no champion priority.");
  if (profile.spell1Id && profile.spell1Id === profile.spell2Id) issues.push("Summoner spells must be different.");
  const overlap = profile.pickPriority.filter((id) => profile.banPriority.includes(id));
  if (overlap.length > 0) issues.push("A champion appears in both pick and ban priorities.");
  return issues;
}

export function ProfileSimulation({ profile, champions }: { profile: AutomationProfile; champions: ChampionRecord[] }) {
  const championById = new Map(champions.map((champion) => [champion.id, champion.name]));
  const issues = profileIssues(profile);
  const choice = (ids: number[]) => ids.length > 0
    ? `${championById.get(ids[0]!) ?? `Champion ${ids[0]}`} first · ${Math.max(0, ids.length - 1)} backup${ids.length === 2 ? "" : "s"}`
    : "No action configured";
  return (
    <aside className="profile-simulation" aria-labelledby="profile-simulation-title">
      <div className="panel__header"><div><p className="eyebrow">Profile preview</p><h3 id="profile-simulation-title">What SummonerKit will attempt</h3></div><StatusPill tone={issues.length > 0 ? "warning" : "positive"}>{issues.length > 0 ? "Review" : "Ready"}</StatusPill></div>
      <dl>
        <div><dt><MousePointer2 size={15} />Pick</dt><dd>{choice(profile.pickPriority)}</dd></div>
        <div><dt><Ban size={15} />Ban</dt><dd>{choice(profile.banPriority)}</dd></div>
        <div><dt>Context</dt><dd>{profile.queueIds.length > 0 ? profile.queueIds.map(queueName).join(", ") : "Any queue"} · {profile.role === "default" ? "Any role" : profile.role}</dd></div>
        <div><dt>Timing</dt><dd>Accept after {profile.readyCheckDelayMs / 1_000}s · lock with {profile.lockLeadTimeMs / 1_000}s left</dd></div>
      </dl>
      {issues.length > 0 ? <ul>{issues.map((issue) => <li key={issue}><AlertTriangle size={14} />{issue}</li>)}</ul> : <p className="profile-simulation__ready"><CheckCircle2 size={15} />Use Dry run to validate this profile against a live champion-select session without writing.</p>}
    </aside>
  );
}
