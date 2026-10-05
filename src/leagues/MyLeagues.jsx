import { useEffect, useState } from "react";
import { Frame, Button, ButtonRow, Chip } from "../ui/index.js";
import { LEVEL_NAME, LEVEL_FLOOR, PLAYED_BONUS, TRACK_BONUS, SELF_CAP } from "./record.js";

// MY FILE: JOIN THE LEAGUES (netlify/lib/league-entries.js, /api/leagues). The file's citizen enters
// one or two of the four leagues and the tennis ladder; it is drafted at the next season's draft
// among the athletes, at its own rating from the file, and shown as SUBJECT and its tag. Its season
// lines ("BATTING .287 FOR THE CURATED NINE. THE DEPARTMENT IS UNMOVED.") come back here.
// An ATHLETIC RECORD on the case (admin-set; src/leagues/record.js) is shown read-only, with its floor.
// Renders nothing for a file the leagues will not draft (unassessed, or under a harm finding).
const LABEL = { baseball: "BASEBALL", basketball: "BASKETBALL", football: "FOOTBALL", soccer: "SOCCER", tennis: "TENNIS LADDER" };
const when = (iso) => { try { return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).toUpperCase(); } catch { return iso; } };
async function call(caseId, sports) {
  const r = sports
    ? await fetch("/api/leagues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, sports }) })
    : await fetch(`/api/leagues?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "The Commissioner's office did not answer.");
  return d;
}

export default function MyLeagues({ caseId }) {
  const [d, setD] = useState(null);
  const [pick, setPick] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!caseId) return;
    let off = false;
    call(caseId).then(x => { if (!off) { setD(x); setPick(x.entry?.sports || []); } }).catch(() => {});
    return () => { off = true; };
  }, [caseId]);
  if (!caseId || !d || (!d.eligible && !d.entry && !d.lines?.length && !d.drafted?.length)) return null;
  const entered = d.entry?.sports || [];
  const same = pick.length === entered.length && pick.every(x => entered.includes(x));
  const toggle = (sp) => setPick(p => (p.includes(sp) ? p.filter(x => x !== sp) : p.length >= d.max ? [...p.slice(1), sp] : [...p, sp]));
  async function file(sports) {
    setBusy(true); setMsg(null);
    try {
      const x = await call(caseId, sports);
      setD(x); setPick(x.entry?.sports || []);
      if (x.changed) setMsg({ ok: true, text: x.withdrawn ? `WITHDRAWN. ${x.name} WILL NOT BE IN THE SEASON ${x.season} DRAFT. THE DEPARTMENT HAD NOT NOTICED.` : `ENTERED. ${x.name} GOES INTO THE SEASON ${x.season} DRAFT. THE DEPARTMENT WILL BE WATCHING. IT WATCHES ANYWAY.` });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  const f = d.file || {};
  const recList = d.record ? [...(d.record.played || []).map(sp => LABEL[sp]), ...(d.record.track ? ["TRACK"] : [])] : [];
  return (
    <Frame title="THE LEAGUES" meta={entered.length ? `ENTERED // SEASON ${d.season}` : "JOIN THE LEAGUES"} className="hvi-myleagues">
      {d.lines?.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 var(--s2)", padding: 0, display: "grid", gap: 2 }}>
          {d.lines.map(l => <li key={l.sport} className="hvi-note" style={{ margin: 0 }}>{l.text}</li>)}
        </ul>
      )}
      {d.drafted?.map(x => (
        <div key={x.season} className="hvi-note">IN THE SEASON {x.season} DRAFT (MACHINE DAY {x.draftDay}, {when(x.draftAt)}): {x.sports.map(sp => `${LABEL[sp]} ${x.r?.[sp] ?? ""}`.trim()).join(", ")}.</div>
      ))}
      {d.eligible && (
        <>
          <div className="hvi-note">
            {entered.length
              ? `${d.name} IS ENTERED: ${entered.map(sp => `${LABEL[sp]} (RATING ${d.entry.r?.[sp]})`).join(", ")}. IT STAYS ENTERED EVERY SEASON UNTIL YOU WITHDRAW.`
              : `YOUR CITIZEN, ${d.name}, MAY ENTER ONE OR TWO: THE FOUR LEAGUES OR THE TENNIS LADDER. ENTRANTS ARE DRAFTED AMONG THE ATHLETES AT THEIR OWN RATING, BY THE SAME SNAKE AND THE SAME CAP. ON THE LADDER, THE BOTTOM RUNGS.`}
          </div>
          <div className="hvi-note">NEXT DRAFT: SEASON {d.season}, MACHINE DAY {d.draftDay} ({when(d.draftAt)}). ENTRIES AND WITHDRAWALS FOR IT CLOSE AT MACHINE DAY {d.closeDay} ({when(d.closeAt)}); AFTER THAT THEY COUNT FOR THE ONE AFTER.</div>
          {d.record && (
            <div className="hvi-note">
              ATHLETIC RECORD ON FILE: {LEVEL_NAME[d.record.level]}{recList.length ? ` // ${recList.join(", ")}` : ""}.
            </div>
          )}
          <div className="ui-chips" role="group" aria-label="Sports to enter" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "var(--s2) 0" }}>
            {d.sports.map(sp => <Chip key={sp} pressed={pick.includes(sp)} onClick={() => toggle(sp)} disabled={busy}>{LABEL[sp]} {d.preview?.[sp]}</Chip>)}
          </div>
          <div className="hvi-note" style={{ opacity: 0.8 }}>
            {d.record ? "RATED: THE HIGHER OF YOUR FILE, " : "RATED FROM YOUR FILE: "}0.45 x PHYSICAL ({f.physical ?? "UNASSESSED: 50"}) + 0.25 x COMPETENCE ({f.competence ?? 50}) + 0.10 x ADAPTABILITY ({f.adaptability ?? 50}){d.ath ? `, +4 FOR THE ATHLETICS YOUR FILE RECORDS${d.named?.length ? `, +3 MORE IN ${d.named.map(sp => LABEL[sp]).join(" AND ")}` : ""}` : d.record ? "" : ". YOUR FILE RECORDS NO ATHLETICS; TELL THE OFFICER AT YOUR NEXT VISIT"}{d.record ? `, AND THE FLOOR OF THE ATHLETIC RECORD ON FILE: ${LEVEL_NAME[d.record.level]} ${LEVEL_FLOOR[d.record.level]}, +${PLAYED_BONUS} IN EACH SPORT PLAYED AT THAT LEVEL${d.record.track ? `, +${TRACK_BONUS} IN FOOTBALL, SOCCER AND BASKETBALL FOR TRACK` : ""}, NEVER OVER ${SELF_CAP}` : ""}. THE STARS ON FILE ARE RATED IN THE 80S AND 90S. THE DEPARTMENT DOES NOT GRADE ON A CURVE.
          </div>
          <ButtonRow stackOnMobile>
            <Button variant={same ? "secondary" : "primary"} disabled={busy || !pick.length || same} onClick={() => file(pick)}>{entered.length ? "Change the entry" : "Enter the draft"}</Button>
            {entered.length > 0 && <Button variant="back" disabled={busy} onClick={() => file([])}>Withdraw</Button>}
            <Button variant="secondary" href="#city/league">The leagues</Button>
          </ButtonRow>
        </>
      )}
      {msg && <div className="hvi-note" role={msg.ok ? "status" : "alert"}>{msg.ok ? "" : "!! "}{msg.text}</div>}
    </Frame>
  );
}
