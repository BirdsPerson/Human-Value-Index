import { useEffect, useState } from "react";
import { Frame, Button, ButtonRow } from "../../ui/index.js";
import { loadAquarium } from "./api.js";
import { loadBests } from "./box.js";
import { SPECIES_BY } from "./data.js";

// MY FILE: the file's angling. The aquarium's donations and the city records it holds (server, by
// replay), and this browser's personal bests. Renders nothing until there is something to show.
export default function MyFish({ caseId }) {
  const [mine, setMine] = useState(null);
  const [bests] = useState(loadBests);
  useEffect(() => {
    if (!caseId) return;
    let off = false;
    loadAquarium(caseId).then(j => { if (!off) setMine(j?.mine || null); }).catch(() => {});
    return () => { off = true; };
  }, [caseId]);
  const nb = Object.keys(bests).length;
  if (!caseId || (!mine?.n && !nb)) return null;
  const lines = [];
  for (const sp of mine?.records || []) lines.push(`HOLDS THE CITY RECORD FOR ${SPECIES_BY[sp]?.name || sp}. THE PLAQUE IS IN THE AQUARIUM. THE DEPARTMENT CHECKED.`);
  if (mine?.n) lines.push(`DONATED ${mine.n} ${mine.n === 1 ? "FISH" : "FISH"} TO THE AQUARIUM. EACH ONE RE-PLAYED BEFORE IT WAS ACCEPTED.`);
  if (nb) lines.push(`PERSONAL BESTS IN ${nb} ${nb === 1 ? "SPECIES" : "SPECIES"} (THIS BROWSER): ${Object.entries(bests).sort((a, b) => b[1].cw - a[1].cw).slice(0, 3).map(([sp, b]) => `${SPECIES_BY[sp]?.name || sp} ${(b.cw / 100).toFixed(2)} LB`).join(", ")}.`);
  return (
    <Frame title="THE WATERS" meta={mine?.records?.length ? `${mine.records.length} CITY RECORD${mine.records.length === 1 ? "" : "S"}` : "ANGLER ON FILE"}>
      <ul style={{ listStyle: "none", margin: "0 0 var(--s2)", padding: 0, display: "grid", gap: 2 }}>
        {lines.map(l => <li key={l} className="hvi-note" style={{ margin: 0 }}>{l}</li>)}
      </ul>
      <ButtonRow><Button variant="secondary" href="#fish">Go fishing</Button><Button variant="secondary" href="#aquarium">The aquarium</Button></ButtonRow>
    </Frame>
  );
}
