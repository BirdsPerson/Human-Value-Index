import { useCallback, useEffect, useState } from "react";
import { Frame } from "./ui/components.jsx";
import { loadEconomy } from "./economy/client.js";
import { loadAssembly } from "./assembly/client.js";
import { loadChess } from "./chess/api.js";
import { stepsFrom, progressOf, noted, note, localGames, introOf, shownOrder, DONE_LINE } from "./firstDay.js";

// YOUR FIRST DAY (src/firstDay.js): the checklist on MY FILE and the interview's result, and its
// one-line form on the landing (variant="compact"). Reads the file's real state from the rooms'
// own endpoints; ticks itself. Once every step that can be taken is done, the Department says so
// and the list folds to a line (latched per case on this device).

const CSS = `
  .fd { margin-bottom: var(--s5); }
  .fd-intro { color: var(--fg); font-size: var(--t-s); line-height: var(--lh); margin: 0 0 var(--s3); }
  .fd-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s1); }
  .fd-list > li { min-width: 0; }
  .fd-item { border-left: var(--bw) solid var(--line); }
  .fd-item.done { border-left-color: var(--accent); }
  .fd-row { font-size: var(--t-m); }
  .fd-row .name { white-space: normal; overflow: visible; line-height: var(--lh-tight); }
  @media (max-width: 480px) { .fd-row .dots { display: none; } .fd-row .name { flex: 1 1 auto; } }
  .fd-row .lead { color: var(--accent); font-weight: 700; }
  .fd-item.later .fd-row .name, .fd-item.later .fd-row .lead { color: var(--fg-mute); }
  .fd-item.done .fd-row .name { color: var(--fg-dim); }
  .fd-row .val { color: var(--accent); }
  .fd-item.done .fd-row .val, .fd-item.later .fd-row .val { color: var(--fg-mute); }
  .fd-sub { margin: 0; padding: 0 var(--s1) var(--s2) calc(var(--s1) + 4ch); color: var(--fg-dim); font-size: var(--t-xs); line-height: var(--lh-tight); }
  .fd-opt { color: var(--fg-mute); font-size: var(--t-xs); padding: var(--s2) var(--s1) var(--s1); }
  .fd-sub, .fd-save { white-space: normal; overflow-wrap: anywhere; }
  .fd-save { max-width: calc(100% - 4ch - 2 * var(--s1)); text-align: left; margin: 0 var(--s1) var(--s2) calc(var(--s1) + 4ch); min-height: var(--hit-min); padding: 0 var(--s3); background: none;
    border: var(--bw) solid var(--line-hi); color: var(--fg); cursor: pointer; font-size: var(--t-xs); letter-spacing: 0.06em; }
  .fd-save:hover { background: var(--panel-hi); }
  .fd-save:focus-visible { outline: var(--focus); outline-offset: 2px; }
  .fd-line { display: flex; align-items: center; gap: 1ch; min-height: var(--hit-min); width: 100%; padding: var(--s1) var(--s2); margin-bottom: var(--s4);
    border: var(--bw) solid var(--line); background: none; color: var(--fg-dim); font-size: var(--t-xs); text-align: left; cursor: pointer; text-decoration: none; }
  .fd-line .k { color: var(--accent); font-weight: 700; }
  .fd-line:focus-visible { outline: var(--focus); outline-offset: 2px; }
  .fd-compact .fd-next { display: flex; align-items: center; min-height: var(--hit-min); color: var(--fg-dim); font-size: var(--t-xs); padding: 0 var(--s1) var(--s2) calc(var(--s1) + 4ch); }
`;
let styled = false;
function injectStyles() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const el = document.createElement("style");
  el.setAttribute("data-hvi", "firstday");
  el.textContent = CSS;
  document.head.appendChild(el);
}

// MY FILE's leagues frame (src/leagues/MyLeagues.jsx) arrives after its fetch: wait for it.
export function scrollToId(id, tries = 20) {
  const el = typeof document !== "undefined" && document.getElementById(id);
  if (el) {
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    return;
  }
  if (tries > 0) setTimeout(() => scrollToId(id, tries - 1), 150);
}

const softly = (p) => p.catch(() => null);
async function gather(caseId) {
  const [econ, assembly, leagues, chess] = await Promise.all([
    loadEconomy(caseId).catch(e => (e?.status === 403 || e?.status === 404 ? { gate: true } : null)),
    softly(loadAssembly({ caseId })),
    softly(fetch(`/api/leagues?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" }).then(r => (r.ok ? r.json() : null))),
    softly(loadChess(caseId).then(d => d?.record || null)),
  ]);
  return { econ, assembly, leagues, chess };
}

export function useFirstDay(caseId) {
  const [server, setServer] = useState(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    if (!caseId) return undefined;
    let off = false;
    gather(caseId).then(d => { if (!off) setServer(d); });
    return () => { off = true; };
  }, [caseId, tick]);
  useEffect(() => {
    // A step taken in another room ticks here when the tab comes back.
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    const onNote = () => setServer(s => (s ? { ...s } : s));
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("hvi-firstday", onNote);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("hvi-firstday", onNote); };
  }, [refresh]);
  const local = { games: localGames(), saved: noted(caseId, "save"), petition: noted(caseId, "petition"), city: noted(caseId, "city") };
  const steps = stepsFrom({ ...(server || {}), ...local }, caseId);
  const prog = progressOf(steps);
  const latched = noted(caseId, "done");
  useEffect(() => { if (server && prog.complete && !latched) note(caseId, "done"); }, [server, prog.complete, latched, caseId]);
  return { steps, prog, loading: !server, complete: latched || (Boolean(server) && prog.complete) };
}

function Step({ s, caseId, total }) {
  const mark = s.status === "done" ? "[X]" : s.status === "later" ? "[-]" : "[ ]";
  const state = s.status === "done" ? "Done." : s.status === "later" ? "Not available yet." : "Not done.";
  const onClick = (e) => {
    if (s.id === "city") note(caseId, "city");
    if (s.id === "league" && document.getElementById("hvi-leagues")) { e.preventDefault(); scrollToId("hvi-leagues"); }
  };
  return (
    <li className={`fd-item ${s.status}`}>
      <a className="ui-row fd-row" href={s.href} onClick={onClick} aria-describedby={`fd-sub-${s.id}`}>
        <span className="lead" aria-hidden="true">{mark}</span>
        <span className="name">{s.n}. {s.label}<span className="sr-only">. {s.optional ? "Optional." : `Step ${s.n} of ${total}.`} {state}</span></span>
        <span className="dots" aria-hidden="true">{" " + ".".repeat(200)}</span>
        <span className="val" aria-hidden="true">{s.status === "done" ? "DONE" : s.status === "later" ? "LATER" : "GO ▸"}</span>
      </a>
      <p className="fd-sub" id={`fd-sub-${s.id}`}>{s.note}</p>
      {s.id === "invest" && s.canSave && (
        <button type="button" className="fd-save" onClick={() => note(caseId, "save")}>SAVE INSTEAD. KEEP IT ALL IN CASH.</button>
      )}
    </li>
  );
}

// variant: "full" (MY FILE, the result screen) or "compact" (the landing: unfinished files only).
export default function FirstDay({ caseId, variant = "full" }) {
  useEffect(() => { injectStyles(); }, []);
  const { steps, prog, loading, complete } = useFirstDay(caseId);
  const [reopen, setReopen] = useState(false);
  if (!caseId) return null;
  const required = shownOrder(steps.filter(s => !s.optional)).map((s, i) => ({ ...s, n: i + 1 }));
  const extra = steps.filter(s => s.optional).map((s, i) => ({ ...s, n: required.length + 1 + i }));
  const meta = loading ? "CHECKING YOUR FILE" : `${prog.done} OF ${prog.total} DONE`;

  if (variant === "compact") {
    if (complete || loading) return null;
    const next = prog.next;
    return (
      <nav className="fd fd-compact" aria-label="Your first day">
        <a className="ui-row fd-row" href="#file">
          <span className="lead" aria-hidden="true">[{prog.done}/{prog.total}]</span>
          <span className="name">YOUR FIRST DAY<span className="sr-only">: {prog.done} of {prog.total} done.</span></span>
          <span className="dots" aria-hidden="true">{" " + ".".repeat(200)}</span>
          <span className="val" aria-hidden="true">MY FILE ▸</span>
        </a>
        {next && <a className="fd-next" href={next.href} onClick={() => { if (next.id === "city") note(caseId, "city"); }}>NEXT: {next.label} ▸</a>}
      </nav>
    );
  }

  if (complete && !reopen) return (
    <button type="button" className="fd-line" aria-expanded="false" onClick={() => setReopen(true)}>
      <span className="k" aria-hidden="true">[X]</span><span>{DONE_LINE}</span><span aria-hidden="true">▸</span>
    </button>
  );

  return (
    <Frame title="YOUR FIRST DAY" meta={meta} className="fd">
      {complete
        ? <p className="fd-intro">{DONE_LINE}</p>
        : <p className="fd-intro">{introOf(prog.total)}</p>}
      <ol className="fd-list" aria-label={`Your first day: ${meta.toLowerCase()}`}>
        {required.map(s => <Step key={s.id} s={s} caseId={caseId} total={required.length} />)}
      </ol>
      {extra.length > 0 && <div className="fd-opt" aria-hidden="true">AND, IF YOU HAVE THE TIME:</div>}
      <ul className="fd-list" aria-label="Optional">
        {extra.map(s => <Step key={s.id} s={s} caseId={caseId} total={required.length} />)}
      </ul>
      {complete && <button type="button" className="fd-line" aria-expanded="true" onClick={() => setReopen(false)}><span>FOLD THE LIST</span></button>}
    </Frame>
  );
}
