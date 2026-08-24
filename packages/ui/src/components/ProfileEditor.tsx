import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type { AutomationProfile, CompanionCommand } from "@summonerkit/contracts";

const spells = [
  { id: 4, name: "Flash" },
  { id: 14, name: "Ignite" },
  { id: 12, name: "Teleport" },
  { id: 11, name: "Smite" },
  { id: 7, name: "Heal" },
  { id: 6, name: "Ghost" },
  { id: 3, name: "Exhaust" },
  { id: 21, name: "Barrier" },
  { id: 1, name: "Cleanse" },
];

function parseIds(value: string): number[] {
  return [...new Set(value.split(/[\s,]+/).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function newProfile(): AutomationProfile {
  return {
    id: crypto.randomUUID(),
    name: "New profile",
    queueIds: [],
    role: "default",
    pickPriority: [],
    banPriority: [],
    spell1Id: 4,
    spell2Id: 14,
    runePreset: null,
    readyCheckDelayMs: 1_000,
    lockLeadTimeMs: 3_000,
  };
}

export function ProfileEditor({
  profiles,
  onCommand,
}: {
  profiles: AutomationProfile[];
  onCommand: (command: CompanionCommand) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? "");
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0] ?? newProfile();
  const [draft, setDraft] = useState(selected);
  const [message, setMessage] = useState("");

  useEffect(() => setDraft(selected), [selected]);

  const save = async () => {
    await onCommand({ type: "profile.save", profile: draft });
    setSelectedId(draft.id);
    setMessage("Profile saved locally.");
  };

  const create = () => {
    const profile = newProfile();
    setDraft(profile);
    setSelectedId(profile.id);
    setMessage("");
  };

  const remove = async () => {
    if (draft.id === "default") return;
    await onCommand({ type: "profile.delete", profileId: draft.id });
    setSelectedId("default");
    setMessage("Profile deleted.");
  };

  return (
    <section className="panel profile-editor">
      <div className="panel__header profile-editor__toolbar">
        <div><p className="eyebrow">Profiles</p><h2>Pick and ban priorities</h2></div>
        <div>
          <select aria-label="Select automation profile" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            {!profiles.some((profile) => profile.id === draft.id) ? <option value={draft.id}>{draft.name}</option> : null}
          </select>
          <button className="icon-button" type="button" aria-label="Create profile" onClick={create}><Plus size={18} /></button>
        </div>
      </div>

      <div className="form-grid">
        <label className="field"><span>Profile name</span><input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="field"><span>Assigned role</span><select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AutomationProfile["role"] })}>
          <option value="default">Any role</option><option value="top">Top</option><option value="jungle">Jungle</option><option value="middle">Middle</option><option value="bottom">Bottom</option><option value="utility">Support</option><option value="aram">ARAM</option>
        </select></label>
        <label className="field field--wide"><span>Queue IDs <small>Empty matches any queue</small></span><input value={draft.queueIds.join(", ")} inputMode="numeric" placeholder="420, 440" onChange={(event) => setDraft({ ...draft, queueIds: parseIds(event.target.value) })} /></label>
        <label className="field field--wide"><span>Pick priority <small>Champion IDs, first valid wins</small></span><input value={draft.pickPriority.join(", ")} inputMode="numeric" placeholder="103, 7, 99" onChange={(event) => setDraft({ ...draft, pickPriority: parseIds(event.target.value) })} /></label>
        <label className="field field--wide"><span>Ban priority <small>Allied intents are skipped</small></span><input value={draft.banPriority.join(", ")} inputMode="numeric" placeholder="238, 157, 84" onChange={(event) => setDraft({ ...draft, banPriority: parseIds(event.target.value) })} /></label>
        <label className="field"><span>Ready-check delay</span><div className="input-suffix"><input type="number" min={0} max={10} value={draft.readyCheckDelayMs / 1_000} onChange={(event) => setDraft({ ...draft, readyCheckDelayMs: Number(event.target.value) * 1_000 })} /><span>sec</span></div></label>
        <label className="field"><span>Lock with time left</span><div className="input-suffix"><input type="number" min={1} max={15} value={draft.lockLeadTimeMs / 1_000} onChange={(event) => setDraft({ ...draft, lockLeadTimeMs: Number(event.target.value) * 1_000 })} /><span>sec</span></div></label>
        <label className="field"><span>Summoner spell 1</span><SpellSelect value={draft.spell1Id} onChange={(spell1Id) => setDraft({ ...draft, spell1Id })} /></label>
        <label className="field"><span>Summoner spell 2</span><SpellSelect value={draft.spell2Id} onChange={(spell2Id) => setDraft({ ...draft, spell2Id })} /></label>
      </div>

      <details className="rune-details">
        <summary>Rune preset</summary>
        <p>SummonerKit updates only its own rune page and never deletes a page you created.</p>
        <label className="toggle-inline"><input type="checkbox" checked={draft.runePreset !== null} onChange={(event) => setDraft({ ...draft, runePreset: event.target.checked ? { primaryStyleId: 8000, subStyleId: 8100, selectedPerkIds: [] } : null })} /> Configure a rune preset</label>
        {draft.runePreset ? <div className="form-grid form-grid--nested">
          <label className="field"><span>Primary style ID</span><input type="number" value={draft.runePreset.primaryStyleId} onChange={(event) => setDraft({ ...draft, runePreset: { ...draft.runePreset!, primaryStyleId: Number(event.target.value) } })} /></label>
          <label className="field"><span>Secondary style ID</span><input type="number" value={draft.runePreset.subStyleId} onChange={(event) => setDraft({ ...draft, runePreset: { ...draft.runePreset!, subStyleId: Number(event.target.value) } })} /></label>
          <label className="field field--wide"><span>Selected perk IDs</span><input value={draft.runePreset.selectedPerkIds.join(", ")} onChange={(event) => setDraft({ ...draft, runePreset: { ...draft.runePreset!, selectedPerkIds: parseIds(event.target.value) } })} /></label>
        </div> : null}
      </details>

      <div className="form-actions">
        <span className="form-message" role="status">{message}</span>
        {draft.id !== "default" ? <button className="button button--danger" type="button" onClick={remove}><Trash2 size={16} /> Delete</button> : null}
        <button className="button button--primary" type="button" onClick={save} disabled={!draft.name.trim()}><Save size={16} /> Save profile</button>
      </div>
    </section>
  );
}

function SpellSelect({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return <select value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}><option value="">Do not change</option>{spells.map((spell) => <option key={spell.id} value={spell.id}>{spell.name} · {spell.id}</option>)}</select>;
}
