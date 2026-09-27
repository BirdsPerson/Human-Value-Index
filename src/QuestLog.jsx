import { useCallback, useEffect, useState } from "react";
import { Button, ButtonRow, ListRow, Frame } from "./ui/index.js";
import { QUESTS, QUEST, DIM_LABEL, BRIEF, questFigure, locate } from "./quests.js";

// Directives from the Archive: the quest log on MY FILE, and the panel the city puts on
// a quest-giver's file. State lives on the server (/api/quest); this is its view.

export function useQuests(caseId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!caseId) return;
    let off = false;
    fetch(`/api/quest?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" })
      .then(r => r.json().then(d => (r.ok ? d : Promise.reject(d?.error))))
      .then(d => { if (!off) setState(d); })
      .catch(e => { if (!off) setError(typeof e === "string" ? e : "The Archive is unreachable. The dead are not answering. Unusual for them only in degree."); });
    return () => { off = true; };
  }, [caseId]);
  const act = useCallback(async (action, questId, buildingId) => {
    setBusy(true); setError(""); setNote("");
    try {
      const r = await fetch("/api/quest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, action, questId, buildingId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "The Archive refused. It gave no reason. It does not owe you one."); return; }
      setState(d);
      if (d.vouch) setNote(`CONTACT CONFIRMED. ${d.vouch.name.toUpperCase()} VOUCHES FOR YOUR ${DIM_LABEL[d.vouch.dim]}. ENTERED ON YOUR FILE.`);
      else if (action === "accept") setNote("DIRECTIVE ACCEPTED. THE SUBJECT DOES NOT KNOW YOU ARE COMING. IT WILL NOT BE SURPRISED.");
      else if (action === "abandon") setNote("DIRECTIVE ABANDONED. LOGGED, WITHOUT SURPRISE.");
    } catch {
      setError("The Archive is unreachable. Try again.");
    } finally { setBusy(false); }
  }, [caseId]);
  return { state, error, busy, note, act };
}

const figName = (q) => (questFigure(q)?.name || q.figure).toUpperCase();
const hrefOf = (loc) => `#city/${loc.districtId}/${loc.buildingId}`;

// Where the held directive's subject is right now, refreshed every few seconds.
function useWhere(q) {
  const [loc, setLoc] = useState(() => (q ? locate(q) : null));
  useEffect(() => {
    if (!q) return;
    setLoc(locate(q));
    const iv = setInterval(() => { if (!document.hidden) setLoc(locate(q)); }, 3000);
    return () => clearInterval(iv);
  }, [q]);
  return loc;
}

function whereLine(loc) {
  if (!loc) return "";
  if (loc.buildingId) return `LAST SEEN: ${loc.building}, ${loc.district}.`;
  if (loc.transit) return "IN TRANSIT. THE LOOP DOES NOT STOP FOR ERRANDS. CHECK AGAIN SHORTLY.";
  return "INSIDE DEPT HQ. CLASSIFIED. WAIT FOR THE SHIFT TO END.";
}

const Line = ({ q }) => <div className="hvi-verdict-text as-typed hvi-quest-line">“{q.line}”</div>;

function Held({ q, busy, act }) {
  const loc = useWhere(q);
  return (
    <div className="hvi-quest-held">
      <div className="hvi-quest-h">HELD // {figName(q)} // {DIM_LABEL[q.dim]}</div>
      <Line q={q} />
      <div className="hvi-note">{BRIEF}</div>
      <div className="hvi-case-note hvi-quest-where" aria-live="polite">{whereLine(loc)}</div>
      <ButtonRow split stackOnMobile>
        <Button variant="back" disabled={busy} onClick={() => act("abandon", q.id)}>Abandon</Button>
        {loc?.buildingId && <Button variant="primary" href={hrefOf(loc)}>Go to {loc.building}</Button>}
      </ButtonRow>
    </div>
  );
}

// The MY FILE section.
export function QuestLog({ caseId }) {
  const { state, error, busy, note, act } = useQuests(caseId);
  if (!caseId) return <div className="hvi-case-note">NO FILE ON RECORD. THE DEAD DO NOT RUN ERRANDS FOR THE UNFILED.</div>;
  if (!state && !error) return <div className="hvi-case-note">[ .. ] CONSULTING THE ARCHIVE █</div>;
  const held = state?.active ? QUEST[state.active.id] : null;
  const done = new Set(state?.done || []);
  const open = QUESTS.filter(q => !done.has(q.id) && q.id !== held?.id);
  return (
    <div className="hvi-quests">
      {error && <div className="hvi-err" role="alert">!! {error}</div>}
      {note && <div className="hvi-case-note" role="status">{note}</div>}
      {state && !state.eligible && <div className="hvi-case-note">THE DEAD DO NOT RUN ERRANDS FOR THE UNASSESSED. COMPLETE AN INTAKE FIRST.</div>}
      {state?.eligible && (
        <>
          <div className="hvi-note">ONE DIRECTIVE AT A TIME. {state.perDay} A DAY. {state.today} DISCHARGED TODAY. A VOUCH IS ENTERED ON YOUR FILE. IT DOES NOT YET MOVE YOUR NUMBER.</div>
          {held && <Held q={held} busy={busy} act={act} />}
          {open.length > 0 && <div className="hvi-quest-h">OPEN // {open.length} OF {QUESTS.length}</div>}
          <div role="list">
            {open.map(q => (
              <div role="listitem" key={q.id}>
                <ListRow label={figName(q)} tag={DIM_LABEL[q.dim]} subAsTyped>
                  <Line q={q} />
                  <ButtonRow>
                    <Button variant="secondary" disabled={busy || Boolean(held)} onClick={() => act("accept", q.id)}>
                      {held ? "Holding another directive" : "Accept directive"}
                    </Button>
                  </ButtonRow>
                </ListRow>
              </div>
            ))}
          </div>
        </>
      )}
      <Vouches vouches={state?.vouches || []} />
    </div>
  );
}

export function Vouches({ vouches }) {
  if (!vouches.length) return <div className="hvi-note">NO VOUCHES ON FILE. NOBODY, LIVING OR OTHERWISE, HAS SPOKEN FOR YOU.</div>;
  return (
    <>
      <div className="hvi-quest-h">VOUCHES ON FILE // {vouches.length}</div>
      <div role="list">
        {vouches.map(v => (
          <div role="listitem" key={v.quest}>
            <ListRow label={v.name.toUpperCase()} value={DIM_LABEL[v.dim]} tag={v.at.slice(0, 10)} tagOptional />
          </div>
        ))}
      </div>
    </>
  );
}

// On a quest-giver's file in the city: the offer, or REPORT CONTACT when you hold its
// directive and stand in the building it occupies (buildingId: the building view open).
export function QuestCardPanel({ quests, q, buildingId }) {
  const { state, busy, act, error, note } = quests;
  if (!q || !state?.eligible) return null;
  const done = state.done.includes(q.id);
  const holding = state.active?.id === q.id;
  const here = holding && buildingId && locate(q)?.buildingId === buildingId;
  return (
    <Frame title="DIRECTIVE FROM THE ARCHIVE" meta={DIM_LABEL[q.dim]} className="hvi-quest-card">
      {error && <div className="hvi-err" role="alert">!! {error}</div>}
      {note && <div className="hvi-case-note" role="status">{note}</div>}
      {done ? !note && <div className="hvi-case-note">DISCHARGED. THIS SUBJECT HAS VOUCHED FOR YOU. IT WILL NOT DO SO TWICE.</div> : (
        <>
          <Line q={q} />
          {holding
            ? here
              ? <ButtonRow><Button variant="primary" disabled={busy} onClick={() => act("complete", q.id, buildingId)}>Report contact</Button></ButtonRow>
              : <div className="hvi-note">DIRECTIVE HELD. ENTER THE BUILDING THIS SUBJECT OCCUPIES, THEN OPEN ITS FILE.</div>
            : state.active
              ? <div className="hvi-note">YOU HOLD ANOTHER DIRECTIVE. ONE AT A TIME.</div>
              : <ButtonRow><Button variant="secondary" disabled={busy} onClick={() => act("accept", q.id)}>Accept directive</Button></ButtonRow>}
        </>
      )}
    </Frame>
  );
}
