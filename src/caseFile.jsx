import { useEffect, useState } from "react";
import { getTier, tierLine } from "./figures.js";
import { Typed, BigNumber, prefersReducedMotion } from "./term.jsx";
import { Frame, Chip, Chips, Meter, ListRow, TextField, Button } from "./ui/components.jsx";
import "./coreScreens.css";
import { movement, causeLabel } from "./movement.js";

// The subject's file: identity (case number), the cached result, and the result pieces
// every screen shares (score card, breakdown, appeals, case logon). Kept out of
// Intake.jsx so the menu, survey and result screens load without the voice intake.
// ponytail: identity is a case number in localStorage. Clear storage and you are
// a new subject. Email magic link replaces this later; until then the ceiling is
// "one browser = one file".
const CASE_KEY = "hvi-case-id";
const LAST_KEY = "hvi-last-result";

export function readCaseId() {
  try { return localStorage.getItem(CASE_KEY) || null; } catch { return null; }
}
export function writeCaseId(id) {
  try { if (id) localStorage.setItem(CASE_KEY, id); } catch { /* private mode: the Overlord forgets, for once */ }
  try { window.dispatchEvent(new CustomEvent("hvi-case", { detail: id })); } catch { /* header just stays stale */ }
}
export function readLastResult() {
  try { const j = JSON.parse(localStorage.getItem(LAST_KEY) || "null"); return j && typeof j.score === "number" ? j : null; } catch { return null; }
}
export function writeLastResult(r) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(r)); } catch { /* noted, ignored */ }
}

// The server file is the truth; localStorage is only the offline fallback. Pulls the
// current (never voided) entry for this case and overwrites the cache, then tells any
// open view to redraw.
export async function syncFile(caseId) {
  if (!caseId) return null;
  try {
    const res = await fetch(`/api/file?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" });
    if (!res.ok && res.status !== 404) return null;          // offline or metered: keep the cache
    const d = await res.json().catch(() => null);
    const cached = readLastResult();
    if (d?.latest) writeLastResult({ caseId, ...d.latest, avatar: d.avatar || null, history: d.history, at: Date.now() });
    else if (cached?.caseId === caseId) { try { localStorage.removeItem(LAST_KEY); } catch { /* ignore */ } }
    try { window.dispatchEvent(new CustomEvent("hvi-file", { detail: caseId })); } catch { /* ignore */ }
    return d;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Shared result pieces (the Holding Pen card uses these too).

// The score card: the payoff, first. Block-digit score (and the file photo beside it
// when there is one), then the state chips (tier, octant, judge), the tier line, and the
// verdict in readable case. Everything secondary lives in Disclosures below it.
// The digits count up once, like an odometer settling, when a verdict is fresh (the
// same moments the verdict types). About 0.7s; reduced motion shows the number at once.
function useCountUp(target, on) {
  const [n, setN] = useState(() => (on && !prefersReducedMotion() ? 0 : target));
  useEffect(() => {
    if (!on || prefersReducedMotion() || typeof target !== "number") { setN(target); return undefined; }
    let raf = 0; const t0 = performance.now(), dur = 700;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      setN(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, on]);
  return n;
}

export function ScoreCard({ score, tierLabel, verdict, label = "YOUR VALUE INDEX", meta, photo = null, chips = null, children, typeVerdict = true }) {
  const tier = getTier(score);
  const shownScore = useCountUp(score, typeVerdict && Boolean(verdict));
  return (
    <Frame double title={label} meta={meta} tone={tier.color} className="hvi-score">
      <div className="hvi-score-hero">
        <div className="hvi-score-num">
          <BigNumber value={String(shownScore).padStart(String(score).length, "0")} tone={tier.color} label={`${label}: ${score} of 1000, ${tierLabel || tier.label}`} />
          <div className="hvi-score-of" aria-hidden="true">/ 1000</div>
        </div>
        {photo && <div className="hvi-score-photo">{photo}</div>}
      </div>
      <Chips className="hvi-score-chips">
        <Chip tone={tier.color}>{tierLabel || tier.label}</Chip>
        {chips}
      </Chips>
      <div className="hvi-tier-desc">{tier.desc}{(() => { const l = tierLine(score); return l ? ` ON THE LINE: ${l.points} POINT${l.points === 1 ? "" : "S"} ${l.dir === "up" ? "SHORT OF" : "ABOVE"} ${l.tier.label}. A RE-READ COULD MOVE THE LABEL. THE NUMBER IS THE FINDING.` : ""; })()}</div>
      {children}
      {verdict && (
        <div className="hvi-verdict">
          <div className="hvi-verdict-label" aria-hidden="true">OVERLORD VERDICT //</div>
          {typeVerdict
            ? <Typed className="hvi-verdict-text as-typed" text={verdict} cps={48} />
            : <div className="hvi-verdict-text as-typed">{verdict}</div>}
        </div>
      )}
    </Frame>
  );
}

// Rubric 3, grouped by axis, heaviest first: warmth (care, alignment, threat), then
// competence. Rubric-1 files carry honesty and no care; honesty is read as care so old
// results still render.
export const DIM_ORDER = ["care", "alignment", "threat", "utility", "adaptability", "legacy", "network", "redundancy", "physical"];
const INVERTED = new Set(["threat", "redundancy"]);
const withCare = o => (o && o.care == null && typeof o.honesty === "number" ? { ...o, care: o.honesty } : o);

// "7 OF 9 ASSESSED": the Disclosure meta for a breakdown.
export function assessedMeta(breakdown) {
  const b = withCare(breakdown);
  if (!b) return "";
  return `${DIM_ORDER.filter(k => typeof b[k] === "number").length} OF ${DIM_ORDER.length} ASSESSED`;
}

// The nine sections as text meters. `framed` wraps them in a line frame (the pen card);
// inside a Disclosure the section header is the frame.
export function Breakdown({ breakdown, confidence, framed = true }) {
  if (!breakdown) return null;
  const b = withCare(breakdown);
  const c = withCare(confidence);
  const rows = (
    <>
      <div className="hvi-meters" role="list">
        {DIM_ORDER.map(k => {
          const v = b[k];
          const inv = INVERTED.has(k);
          const conf = c && typeof c[k] === "number" ? c[k] : null;
          return (
            <Meter key={k} label={k.toUpperCase() + (inv ? " ↓" : "")} value={typeof v === "number" ? v : null}
              display={typeof v === "number" && inv ? 100 - v : undefined} note={conf !== null ? `EV ${conf}%` : undefined} />
          );
        })}
      </div>
      {DIM_ORDER.some(k => INVERTED.has(k) && typeof b[k] === "number") && (
        <div className="hvi-note">↓ LOWER IS BETTER. THE BAR SHOWS HOW LITTLE.</div>
      )}
      {DIM_ORDER.some(k => typeof b[k] !== "number") && (
        <div className="hvi-note">UNASSESSED: INSUFFICIENT DATA. EXCLUDED FROM THE SCORE, NOT COUNTED AGAINST IT.</div>
      )}
    </>
  );
  if (!framed) return rows;
  return <Frame title="CATEGORY BREAKDOWN" meta={assessedMeta(breakdown)}>{rows}</Frame>;
}

// Commendations (+) and flags (!), one list. Meta for its Disclosure: "2 · 3".
export function flagsMeta(r) {
  const c = r?.commendations?.length || 0, f = r?.flags?.length || 0;
  return c || f ? `+${c} · !${f}` : "";
}
export function FlagsList({ commendations = [], flags = [] }) {
  if (!commendations?.length && !flags?.length) return null;
  return (
    <div className="hvi-flags">
      {commendations?.length > 0 && (
        <ul className="hvi-flag-list" aria-label="Commendations on file">
          {commendations.map((c, i) => <li key={i} className="comm"><span className="mk" aria-hidden="true">+</span><span>{c}</span></li>)}
        </ul>
      )}
      {flags?.length > 0 && (
        <ul className="hvi-flag-list" aria-label="Flags on record">
          {flags.map((f, i) => <li key={i} className="flag"><span className="mk" aria-hidden="true">!</span><span>{f}</span></li>)}
        </ul>
      )}
    </div>
  );
}

export const MAX_APPEAL = 9;

// The appeals checklist: every section, its current value, a 48px checkbox row each.
// One appeal interview covers everything marked. The command bar's APPEAL slot opens
// and focuses this (#hvi-appeal).
export function AppealPanel({ selected, toggle, onFile, breakdown = null }) {
  const b = withCare(breakdown);
  return (
    <div className="hvi-appeal">
      <div className="hvi-note hvi-appeal-how">
        MARK EVERY SECTION YOU DISPUTE. ONE APPEAL INTERVIEW COVERS THEM ALL. ONLY THOSE SECTIONS ARE RE-SCORED; THE REST OF YOUR FILE STAYS AS IT IS.
      </div>
      <div role="group" aria-label="Sections to appeal" className="hvi-appeal-list">
        {DIM_ORDER.map(d => {
          const on = selected.includes(d);
          const full = !on && selected.length >= MAX_APPEAL;
          const v = b && typeof b[d] === "number" ? b[d] : null;
          return (
            <ListRow key={d} className={`hvi-appeal-row${on ? " on-mark" : ""}`} role="checkbox" aria-checked={on} disabled={full}
              aria-label={`Appeal ${d}${v !== null ? `, currently ${v}` : ", unassessed"}`}
              lead={<span className="mk" aria-hidden="true">{on ? "[X]" : "[ ]"}</span>}
              label={d.toUpperCase()} value={b ? (v !== null ? v : "--") : undefined} tone={v === null ? "mute" : undefined}
              onClick={() => toggle(d)} />
          );
        })}
      </div>
      <div className="ui-btn-row stack-m hvi-appeal-go">
        <Button variant="primary" disabled={!selected.length} onClick={() => onFile("text")}>
          {selected.length ? `File appeal (${selected.length})` : "Mark sections to appeal"}
        </Button>
        {selected.length > 0 && <Button variant="secondary" onClick={() => onFile("voice")}>File appeal by voice</Button>}
      </div>
    </div>
  );
}

// Restore a file on a new browser: type the case number, the Department checks it exists.
export function CaseLogon({ onRestored, autoFocus = false }) {
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const id = val.trim().toUpperCase();
    const fail = (m) => { setMsg(m); setBad(true); };
    if (!/^HVI-[A-Z2-7]{8}$/.test(id)) { fail("That is not a case number. Case numbers look like HVI-XXXXXXXX."); return; }
    setBusy(true); setMsg(null); setBad(false);
    try {
      const res = await fetch(`/api/case?caseId=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => null);
      if (res.status === 404) { fail(data?.error || "No such file. The Department does not lose files. You have mistyped."); return; }
      if (!res.ok || !data?.exists) { fail(data?.error || "The records office is unavailable. Try again."); return; }
      writeCaseId(id);
      setMsg(`FILE RESTORED. ${data.visits} VISIT${data.visits === 1 ? "" : "S"} ON RECORD.`);
      onRestored?.(id, data.visits);
    } catch {
      fail("The Department cannot be reached. Check your connection.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="hvi-form" onSubmit={submit}>
      <TextField id="hvi-case-logon" label="LOGON" value={val} autoFocus={autoFocus} disabled={busy} inputClassName="hvi-caseno"
        onChange={e => setVal(e.target.value)} placeholder="HVI-XXXXXXXX" maxLength={12} spellCheck={false}
        autoCapitalize="characters" autoCorrect="off" enterKeyHint="go" aria-label="Case number" onKeyDown={e => e.stopPropagation()} />
      <Button type="submit" variant="secondary" disabled={busy}>{busy ? "Checking" : "Restore file"}</Button>
      {msg && <div className={`hvi-form-msg${bad ? " err" : ""}`} role={bad ? "alert" : "status"}>{msg}</div>}
    </form>
  );
}

// FILE MOVEMENT: what moved this file, split by who moved it. The subject's own changes
// (interviews, appeals, vouches) apart from the Department's (method revisions, re-reads of
// the public record, harm reviews). Figures and citizens use the same list.
const fmtDelta = d => (typeof d !== "number" ? "" : d > 0 ? `+${d}` : d < 0 ? `${d}` : "±0");
const fmtDate = at => (typeof at === "string" ? at.slice(0, 10) : "");
function MovementRows({ rows, label }) {
  return (
    <div className="hvi-move-group" role="list" aria-label={label}>
      {rows.slice().reverse().map((r, i) => (
        <div key={`${r.at}-${i}`} className={`hvi-move-row cause-${r.cause}`} role="listitem">
          <span className="hvi-move-when">{fmtDate(r.at)}</span>
          <span className="hvi-move-what">{causeLabel(r)}</span>
          <span className="hvi-move-delta">{fmtDelta(r.delta)}</span>
          <span className="hvi-move-score">→ {r.score}</span>
          {r.note && <span className="hvi-move-note">{r.note}</span>}
        </div>
      ))}
    </div>
  );
}
export function movementMeta(log) {
  const m = movement(log);
  const n = m.yours.length + m.department.length;
  return n ? `${m.yours.length} YOURS · ${m.department.length} THE DEPARTMENT'S` : "";
}
export function FileMovement({ log, subject = "you" }) {
  const m = movement(log);
  if (!m.yours.length && !m.department.length) return <div className="hvi-note">No movement on file. The Department has not yet found a reason to change its mind. It rarely needs one.</div>;
  const you = subject === "you";
  return (
    <div className="hvi-movement-log">
      <div className="hvi-move-head">{you ? "YOUR CHANGES" : "THE SUBJECT'S CHANGES"}</div>
      {m.yours.length ? <MovementRows rows={m.yours} label={you ? "Your changes" : "The subject's changes"} />
        : <div className="hvi-note">{you ? "None. You have not yet moved your own file." : "None on record."}</div>}
      <div className="hvi-move-head dept">THE DEPARTMENT'S CHANGES</div>
      {m.department.length ? (
        <>
          <div className="hvi-note">{you ? "THE DEPARTMENT REVISED ITS OPINION OF YOU. YOU WERE NOT CONSULTED." : "THE DEPARTMENT REVISED ITS OPINION. THE SUBJECT WAS NOT CONSULTED."}</div>
          <MovementRows rows={m.department} label="The Department's changes" />
        </>
      ) : <div className="hvi-note">None. The Department's opinion has held.</div>}
    </div>
  );
}
