import { useEffect, useMemo, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import type { AutomationProfile, ChampionRecord, CompanionCommand } from "@summonerkit/contracts";
import { ChampionPriorityField } from "./ChampionPriorityField";

function firstProfileId(profiles: AutomationProfile[]): string {
  return profiles.find((profile) => profile.id === "default")?.id ?? profiles[0]?.id ?? "";
}

export function ChampionPlanEditor({
  profiles,
  champions,
  onCommand,
}: {
  profiles: AutomationProfile[];
  champions: ChampionRecord[];
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(() => firstProfileId(profiles));
  const selectedProfile = profiles.find((profile) => profile.id === selectedId) ?? null;
  const [pickPriority, setPickPriority] = useState(() => selectedProfile?.pickPriority ?? []);
  const [banPriority, setBanPriority] = useState(() => selectedProfile?.banPriority ?? []);
  const [message, setMessage] = useState("");
  const selectedSignature = selectedProfile
    ? `${selectedProfile.pickPriority.join(",")}|${selectedProfile.banPriority.join(",")}`
    : "";
  const dirty = useMemo(
    () => selectedProfile !== null && (
      selectedProfile.pickPriority.join(",") !== pickPriority.join(",") ||
      selectedProfile.banPriority.join(",") !== banPriority.join(",")
    ),
    [banPriority, pickPriority, selectedProfile],
  );

  useEffect(() => {
    if (selectedProfile) return;
    const nextId = firstProfileId(profiles);
    setSelectedId(nextId);
    const next = profiles.find((profile) => profile.id === nextId);
    setPickPriority(next?.pickPriority ?? []);
    setBanPriority(next?.banPriority ?? []);
  }, [profiles, selectedProfile]);

  useEffect(() => {
    if (!selectedProfile) return;
    setPickPriority(selectedProfile.pickPriority);
    setBanPriority(selectedProfile.banPriority);
  }, [selectedId, selectedSignature]);

  const selectProfile = (profileId: string) => {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) return;
    setSelectedId(profile.id);
    setPickPriority(profile.pickPriority);
    setBanPriority(profile.banPriority);
    setMessage("");
  };

  const save = async () => {
    if (!selectedProfile) return;
    await onCommand({ type: "profile.setChampionPriorities", profileId: selectedProfile.id, pickPriority, banPriority });
    setMessage("Champion fallback plan saved locally.");
  };

  if (!selectedProfile) {
    return <section className="panel champion-plan-editor"><p className="priority-field__empty" role="status">No automation profile is available. Create one in the desktop app first.</p></section>;
  }

  return (
    <section className="panel champion-plan-editor" aria-labelledby="champion-plan-title">
      <div className="panel__header champion-plan-editor__header">
        <div><p className="eyebrow">Champion plan</p><h2 id="champion-plan-title">Primary choices and automatic backups</h2></div>
        <label className="champion-plan-editor__profile"><span>Profile</span><select value={selectedId} onChange={(event) => selectProfile(event.target.value)}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
      </div>
      <p className="champion-plan-editor__intro"><ShieldCheck size={15} aria-hidden="true" />SummonerKit validates the list at your turn. It never locks a banned, picked, unavailable, or teammate-protected choice.</p>
      <div className="champion-plan-editor__grid">
        <ChampionPriorityField label="Pick fallback order" action="pick" helper="Choose your primary pick, then as many backups as you want." values={pickPriority} champions={champions} onChange={setPickPriority} />
        <ChampionPriorityField label="Ban fallback order" action="ban" helper="All allied pick intents are protected before a ban is selected." values={banPriority} champions={champions} onChange={setBanPriority} />
      </div>
      <div className="form-actions">
        <span className="form-message" role="status">{message || (dirty ? "Unsaved champion-plan changes." : "Plan is saved.")}</span>
        <button className="button button--primary" type="button" disabled={!dirty} onClick={save}><Save size={16} aria-hidden="true" /> Save champion plan</button>
      </div>
    </section>
  );
}
