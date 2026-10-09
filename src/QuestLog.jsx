import { useCallback, useEffect, useState } from "react";
import { Button, ButtonRow, ListRow, Frame } from "./ui/index.js";
import { QUESTS, QUEST, DIM_LABEL, briefOf, questFigure, questPartner, locate, locatePartner, meetingAt, nextMeeting } from "./quests.js";

// Directives from the Archive: the quest log on MY FILE, and the panel the city puts on
// a quest-giver's file. State lives on the server (/api/quest); this is its view.

export function useQuests(caseId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [last, setLast] = useState(null);   // the directive the last action was about
  useEffect(() => {
    if (!caseId) return;
    let off = false;
    fetch(`/api/quest?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" })
      .then(r => r.json().then(d => (r.ok ? d : Promise.reject(d?.error))))
      .then(d => { if (!off) setState(d); })
      .catch(e => { if (!off) setError(typeof e === "string" ? e : "The Archive is unreachable. The figures are not answering. The Department has noted who was not listening."); });
    return () => { off = true; };
  }, [caseId]);
  const act = useCallback(async (action, questId, buildingId) => {
    setBusy(true); setError(""); setNote(""); setLast(questId);
    try {
      const r = await fetch("/api/quest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, action, questId, buildingId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "The Archive refused. It gave no reason. It does not owe you one."); return; }
      setState(d);
      if (d.vouch) setNote(`${d.vouch.kind === "witness" ? "ATTENDANCE" : "CONTACT"} CONFIRMED. ${d.vouch.name.toUpperCase()} VOUCHES FOR YOUR ${DIM_LABEL[d.vouch.dim]}. ENTERED ON YOUR FILE.${d.vouch.delta ? ` SCORE ${d.vouch.delta > 0 ? "+" : ""}${d.vouch.delta}.` : ""}`);
      else if (action === "accept") setNote("DIRECTIVE ACCEPTED. THE SUBJECT DOES NOT KNOW YOU ARE COMING. IT WILL NOT BE SURPRISED.");
      else if (action === "abandon") setNote("DIRECTIVE ABANDONED. LOGGED, WITHOUT SURPRISE.");
    } catch {
      setError("The Archive is unreachable. Try again.");
    } finally { setBusy(false); }
  }, [caseId]);
  return { state, error, busy, note, last, act };
}

const figName = (q) => (questFigure(q)?.name || q.figure).toUpperCase();
const partnerName = (q) => (questPartner(q)?.name || q.with || "").toUpperCase();
const hrefOf = (loc) => `#city/${loc.districtId}/${loc.buildingId}`;

// The held directive's live readout, refreshed every few seconds: where its subject is
// (find), or where both subjects are and when they next convene (witness).
function readout(q) {
  if (q.kind !== "witness") {
    const loc = locate(q);
    return { go: loc?.buildingId ? loc : null, lines: [whereLine(loc)] };
  }
  const m = meetingAt(q);
  if (m) return { go: m, lines: [`CONVENED NOW: ${m.building}, ${m.district}. GO. MEETINGS END.`] };
  const n = nextMeeting(q);
  return {
    go: null,
    lines: [
      n == null ? "NOT CONVENED. NO MEETING SCHEDULED IN THE NEXT 90 MINUTES. THEY HAVE OTHER APPOINTMENTS."
        : `NOT CONVENED. NEXT MEETING IN ~${Math.max(1, Math.round(n / 60))} MIN.`,
      `${figName(q)}: ${whereLine(locate(q))}`,
      `${partnerName(q)}: ${whereLine(locatePartner(q))}`,
    ],
  };
}
function useReadout(q) {
  const [r, setR] = useState(() => (q ? readout(q) : null));
  useEffect(() => {
    if (!q) return;
    setR(readout(q));
    const iv = setInterval(() => { if (!document.hidden) setR(readout(q)); }, 3000);
    return () => clearInterval(iv);
  }, [q]);
  return r;
}

function whereLine(loc) {
  if (!loc) return "";
  if (loc.buildingId) return `LAST SEEN: ${loc.building}, ${loc.district}.`;
  if (loc.transit) return "IN TRANSIT. THE LOOP DOES NOT STOP FOR ERRANDS. CHECK AGAIN SHORTLY.";
  return "INSIDE DEPT HQ. CLASSIFIED. WAIT FOR THE SHIFT TO END.";
}

const Line = ({ q }) => <div className="hvi-verdict-text as-typed hvi-quest-line">“{q.line}”</div>;
const KindLine = ({ q }) => q.kind === "witness"
  ? <div className="hvi-note">WITNESS // {figName(q)} AND {partnerName(q)}, IN ONE BUILDING.</div>
  : null;

function Held({ q, busy, act }) {
  const r = useReadout(q);
  return (
    <div className="hvi-quest-held">
      <div className="hvi-quest-h">HELD // {figName(q)} // {DIM_LABEL[q.dim]}</div>
      <Line q={q} />
      <div className="hvi-note">{briefOf(q)}</div>
      <div className="hvi-case-note hvi-quest-where" aria-live="polite">
        {r?.lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      <ButtonRow split stackOnMobile>
        {r?.go && <Button variant="primary" href={hrefOf(r.go)}>Go to {r.go.building}</Button>}
        <Button variant="danger" disabled={busy} onClick={() => act("abandon", q.id)}>Abandon directive</Button>
      </ButtonRow>
    </div>
  );
}

// The MY FILE section.
export function QuestLog({ caseId }) {
  const { state, error, busy, note, act } = useQuests(caseId);
  if (!caseId) return <div className="hvi-case-note">NO FILE ON RECORD. NOBODY ON FILE RUNS ERRANDS FOR THE UNFILED.</div>;
  if (!state && !error) return <div className="hvi-case-note">[ .. ] CONSULTING THE ARCHIVE █</div>;
  const held = state?.active ? QUEST[state.active.id] : null;
  const done = new Set(state?.done || []);
  const closed = new Set(state?.closed || []);
  const open = QUESTS.filter(q => !done.has(q.id) && !closed.has(q.dim) && q.id !== held?.id);
  // The payoff first: what the figures have already said for you, then the errand in
  // hand, then the ones on offer. The rules are fine print, last.
  return (
    <div className="hvi-quests">
      {error && <div className="hvi-err" role="alert">!! {error}</div>}
      {note && <div className="hvi-case-note" role="status">{note}</div>}
      {state && <Vouches vouches={state.vouches || []} />}
      {state && !state.eligible && <div className="hvi-case-note">NOBODY ON FILE RUNS ERRANDS FOR THE UNASSESSED. COMPLETE AN INTAKE FIRST.</div>}
      {state?.eligible && (
        <>
          {held && <Held q={held} busy={busy} act={act} />}
          {open.length > 0 && <div className="hvi-quest-h">OPEN // {open.length} OF {QUESTS.length}{held ? " // ONE AT A TIME" : ""}</div>}
          <div role="list">
            {open.map(q => (
              <div role="listitem" key={q.id}>
                <ListRow label={figName(q)} tag={DIM_LABEL[q.dim]} subAsTyped>
                  <KindLine q={q} />
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
          <div className="hvi-note hvi-quest-rules">
            ONE DIRECTIVE AT A TIME. {state.perDay} A DAY. {state.today} DISCHARGED TODAY. A VOUCH IS ENTERED ON YOUR FILE. IT DOES NOT YET MOVE YOUR NUMBER.
            {closed.size > 0 && " A CATEGORY WITH A VOUCH ON FILE ISSUES NO FURTHER DIRECTIVES. ONE VOICE EACH."}
          </div>
        </>
      )}
    </div>
  );
}

export function Vouches({ vouches }) {
  if (!vouches.length) return <div className="hvi-note hvi-quest-none">NO VOUCHES ON FILE. NOBODY ON FILE HAS SPOKEN FOR YOU. YET.</div>;
  return (
    <>
      <div className="hvi-quest-h first">VOUCHES ON FILE // {vouches.length}</div>
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

// On a figure's file in the city, one panel per directive it gives or attends
// (questsFor): the giver's offer, or the REPORT command when you hold the directive and
// stand in the building where it can be discharged (buildingId: the building view open).
// A witness partner's file shows the panel only while you hold that directive.
export function QuestCardPanel({ quests, q, slug, buildingId }) {
  const { state, busy, act } = quests;
  if (!q || !state?.eligible) return null;
  const giver = q.figure === slug;
  const done = state.done.includes(q.id);
  const holding = state.active?.id === q.id;
  if (!giver && !holding && !done) return null;
  // A file can carry two panels; the outcome of an action shows on the one it was about.
  const mine = quests.last === q.id;
  const error = mine && quests.error, note = mine && quests.note;
  const closed = !done && !holding && (state.closed || []).includes(q.dim);
  const witness = q.kind === "witness";
  const where = witness ? meetingAt(q) : locate(q);
  const here = holding && buildingId && where?.buildingId === buildingId;
  return (
    <Frame title="DIRECTIVE FROM THE ARCHIVE" meta={DIM_LABEL[q.dim]} className="hvi-quest-card">
      {error && <div className="hvi-err" role="alert">!! {error}</div>}
      {note && <div className="hvi-case-note" role="status">{note}</div>}
      {done ? !note && <div className="hvi-case-note">{giver
          ? "DISCHARGED. THIS SUBJECT HAS VOUCHED FOR YOU. IT WILL NOT DO SO TWICE."
          : `DISCHARGED. YOU WITNESSED THIS SUBJECT MEET ${figName(q)}. ${figName(q)} VOUCHED. THIS ONE MERELY ATTENDED.`}</div>
        : closed ? <div className="hvi-case-note">YOUR {DIM_LABEL[q.dim]} IS ALREADY VOUCHED FOR. THIS SUBJECT HAS NOTHING TO ADD.</div> : (
        <>
          <KindLine q={q} />
          <Line q={q} />
          {holding
            ? here
              ? <ButtonRow><Button variant="primary" disabled={busy} onClick={() => act("complete", q.id, buildingId)}>{witness ? "Report meeting" : "Report contact"}</Button></ButtonRow>
              : <div className="hvi-note">{witness
                  ? "DIRECTIVE HELD. BE IN THE BUILDING WHILE BOTH SUBJECTS ARE ON ITS FLOORS, THEN OPEN EITHER FILE."
                  : "DIRECTIVE HELD. ENTER THE BUILDING THIS SUBJECT OCCUPIES, THEN OPEN ITS FILE."}</div>
            : state.active
              ? <div className="hvi-note">YOU HOLD ANOTHER DIRECTIVE. ONE AT A TIME.</div>
              : <ButtonRow><Button variant="secondary" disabled={busy} onClick={() => act("accept", q.id)}>Accept directive</Button></ButtonRow>}
        </>
      )}
    </Frame>
  );
}
