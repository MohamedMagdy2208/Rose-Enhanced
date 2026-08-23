import { Palette, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { CompanionCommand, RemoteCompanionSnapshot } from "@rose-enhanced/contracts";

interface LoadoutPanelProps {
  snapshot: RemoteCompanionSnapshot;
  pending: boolean;
  send: (command: CompanionCommand) => void;
}

export function LoadoutPanel({ snapshot, pending, send }: LoadoutPanelProps) {
  const { championSelect, summonerSpells, runePages } = snapshot.session;
  const [spell1Id, setSpell1Id] = useState(championSelect.spell1Id ?? summonerSpells[0]?.id ?? 0);
  const [spell2Id, setSpell2Id] = useState(championSelect.spell2Id ?? summonerSpells[1]?.id ?? 0);
  const [runePageId, setRunePageId] = useState(runePages.find((page) => page.current)?.id ?? runePages[0]?.id ?? 0);

  useEffect(() => {
    if (championSelect.spell1Id) setSpell1Id(championSelect.spell1Id);
    if (championSelect.spell2Id) setSpell2Id(championSelect.spell2Id);
  }, [championSelect.spell1Id, championSelect.spell2Id]);
  useEffect(() => {
    const current = runePages.find((page) => page.current)?.id;
    if (current) setRunePageId(current);
  }, [runePages]);

  return (
    <section className="loadout-panel" aria-labelledby="loadout-title">
      <div className="section-heading"><div><p className="eyebrow">LOADOUT</p><h2 id="loadout-title">Spells, runes, skin</h2></div><WandSparkles size={21} /></div>
      <div className="loadout-block">
        <div className="loadout-label"><Sparkles size={17} /><strong>Summoner spells</strong></div>
        <div className="two-selects">
          <label><span>Spell one</span><select value={spell1Id} onChange={(event) => setSpell1Id(Number(event.target.value))}>{summonerSpells.map((spell) => <option key={spell.id} value={spell.id}>{spell.name}</option>)}</select></label>
          <label><span>Spell two</span><select value={spell2Id} onChange={(event) => setSpell2Id(Number(event.target.value))}>{summonerSpells.map((spell) => <option key={spell.id} value={spell.id}>{spell.name}</option>)}</select></label>
        </div>
        <button type="button" className="button-secondary button-full" disabled={pending || !spell1Id || !spell2Id || spell1Id === spell2Id} onClick={() => send({ type: "champSelect.setSpells", spell1Id, spell2Id })}>Apply spells</button>
      </div>
      <div className="loadout-block">
        <label className="loadout-label" htmlFor="rune-page"><WandSparkles size={17} /><strong>Rune page</strong></label>
        <select id="rune-page" value={runePageId} onChange={(event) => setRunePageId(Number(event.target.value))}>{runePages.map((page) => <option key={page.id} value={page.id}>{page.name}{page.roseManaged ? " · Rose" : ""}</option>)}</select>
        <button type="button" className="button-secondary button-full" disabled={pending || !runePageId} onClick={() => send({ type: "champSelect.setRunePage", pageId: runePageId })}>Use rune page</button>
      </div>
      <div className="loadout-block">
        <div className="loadout-label"><Palette size={17} /><strong>Owned skin</strong></div>
        {snapshot.ownedSkins.length > 0 ? <div className="skin-list">{snapshot.ownedSkins.map((skin) => <button type="button" disabled={pending} className={championSelect.selectedSkinId === skin.id ? "is-selected" : undefined} key={skin.id} onClick={() => send({ type: "champSelect.selectOwnedSkin", skinId: skin.id })}>{skin.name}</button>)}</div> : <p className="empty-copy">Lock or hover a champion to load owned skins.</p>}
      </div>
    </section>
  );
}
