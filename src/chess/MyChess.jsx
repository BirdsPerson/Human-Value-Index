import { useEffect, useState } from "react";
import { Frame, Button, ButtonRow } from "../ui/index.js";
import { loadChess } from "./api.js";

// MY FILE: the file's games against the figures (/api/chess), in the Department's hand:
// "DEFEATED BOBBY FISCHER. THE DEPARTMENT DOUBTS IT." Renders nothing until a game is filed.
export default function MyChess({ caseId }) {
  const [rec, setRec] = useState(null);
  useEffect(() => {
    if (!caseId) return;
    let off = false;
    loadChess(caseId).then(d => { if (!off) setRec(d?.record || null); }).catch(() => {});
    return () => { off = true; };
  }, [caseId]);
  if (!caseId || !rec || !(rec.w + rec.d + rec.l)) return null;
  return (
    <Frame title="PARK CHESS" meta={`RATING ${rec.rating}`}>
      <ul className="hvi-chess-lines" style={{ listStyle: "none", margin: "0 0 var(--s2)", padding: 0, display: "grid", gap: 2 }}>
        {rec.lines.map(l => <li key={l} className="hvi-note" style={{ margin: 0 }}>{l}</li>)}
      </ul>
      <ButtonRow><Button variant="secondary" href="#chess">The stone tables</Button></ButtonRow>
    </Frame>
  );
}
