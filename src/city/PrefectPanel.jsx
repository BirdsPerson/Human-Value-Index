// THE PREFECTS in the city's pages (docs/CITY_SPEC.md "The Prefects"): a district's COUNCIL vs
// PREFECT rows and LEGITIMACY (in DistrictCivic), the PREFECT card (tap one in the city), and the
// page #city/prefects (also #prefects): all twelve and their directives today. Everything is read
// from the day's summary (civic block, prefects.js prefectFold): every viewer sees the same.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Frame, Meter, Button } from "../ui/index.js";
import { DISTRICT } from "./simApi.js";
import { summaryOf } from "./planClient.js";
import { PREFECT, PREFECTS, DIRECTIVES, leanTag, leanWord, legitWord } from "./prefects.js";
import { prefectTitle } from "./prefectData.js";
import { portraitCanvas, signalOf } from "./prefectDraw.js";
import { useCivic } from "./CivicPanel.jsx";

export function Portrait({ id, scale = 2, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const c = portraitCanvas(id, scale);
    c.setAttribute("aria-hidden", "true");
    c.style.imageRendering = "pixelated";
    el.replaceChildren(c);
  }, [id, scale]);
  return <span ref={ref} className={`hvi-pf-portrait ${className}`} style={{ borderColor: signalOf(id) }} />;
}

const clashLine = (pf, seat) => !seat?.holder
  ? "NO COUNCIL. THE PREFECT RULES UNOPPOSED. NOBODY CLASHES WITH NOBODY."
  : pf.clash > 0 ? `CLASH ${pf.clash}: THE COUNCILLOR (${leanTag(seat.lean)}) PULLS AGAINST THE DIRECTIVE.`
    : "NO CLASH. THE COUNCIL AND THE PREFECT PULL THE SAME WAY, FOR NOW.";
export const directiveLine = (pf) => `${DIRECTIVES[pf.directive].name} // INTENSITY ${pf.intensity} OF 5`;

// The rows under COUNCIL on a district's CIVIC RECORD.
export function PrefectRows({ id, x }) {
  const pf = x?.prefect, P = PREFECT[id];
  if (!pf || !P) return null;
  const seat = x.seat;
  return (
    <>
      <span className="k">LEAN</span>
      <span className="v">{seat?.holder ? <><b>{leanTag(seat.lean)}</b> ({leanWord(seat.lean)}), FROM THE VALUES OF THOSE WHO BACK THE SEAT. POLARIZATION {pf.polar}.</> : <>NO COUNCILLOR, NO LEAN. POLARIZATION {pf.polar}.</>}</span>
      <span className="k">PREFECT</span>
      <span className="v"><button type="button" className="hvi-pf-link" onClick={() => openCard(id)}>{prefectTitle(P)}</button>. TODAY: <b>{directiveLine(pf)}</b>. {clashLine(pf, seat)}</span>
      <span className="k">LEGIT.</span>
      <span className="v"><b>{legitWord(pf.legit.s)}</b> ({pf.legit.s} OF 100). THE OVERLORD'S STANDING IN THE DISTRICT. <a href="#city/prefects">ALL PREFECTS</a></span>
    </>
  );
}

const openCard = (id) => window.dispatchEvent(new CustomEvent("hvi-prefect", { detail: id }));

// The record of acts: the directives on the summaries this browser holds, newest first, and
// yesterday's from today's record.
function actsOf(id, day) {
  const out = [];
  for (let d = day; d > day - 7 && d > 0; d--) {
    const x = summaryOf(d)?.civic?.districts?.[id];
    if (x?.prefect) out.push({ day: d, directive: x.prefect.directive, intensity: x.prefect.intensity, clash: x.prefect.clash, legit: x.prefect.legit.s });
    else if (d === day - 1) {
      const t = summaryOf(day)?.civic?.districts?.[id]?.prefect;
      if (t?.was) out.push({ day: d, directive: t.was });
    }
  }
  return out;
}

export function PrefectCard({ id, onClose }) {
  const { block, day } = useCivic();
  const P = PREFECT[id], x = block?.districts?.[id], pf = x?.prefect;
  const closeRef = useRef(null);
  useEffect(() => {
    const prev = document.activeElement, root = document.getElementById("root");
    if (root) root.inert = true;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (root) root.inert = false; if (prev?.focus) prev.focus(); };
  }, [onClose]);
  const acts = actsOf(id, day);
  const moodS = x?.mood?.s ?? 0;
  const today = moodS <= -45 ? (P.temper.unrest === "clamp" ? "HARDENED: THE DISTRICT SEETHES, AND IT CLAMPS DOWN." : "INDULGENT: THE DISTRICT SEETHES, AND IT HANDS OUT FESTIVALS.")
    : moodS <= -15 ? "WARY: THE DISTRICT IS RESTLESS." : moodS >= 45 ? (P.temper.content === "probe" ? "SUSPICIOUS: THE DISTRICT IS CONTENT, WHICH IS BEING INVESTIGATED." : "AT EASE, AS FAR AS A MACHINE IS.") : "ROUTINE.";
  return createPortal(
    <div className="hvi-card-overlay" onClick={onClose}>
      <div className="hvi-card-panel" role="dialog" aria-modal="true" aria-labelledby="hvi-pf-name" onClick={e => e.stopPropagation()}>
        <div className="hvi-card-body">
          <div className="hvi-card-top">
            <span className="hvi-card-kind"><span className="where">PREFECT FILE // {DISTRICT[id]?.name}</span>MACHINE CONSTRUCT OF THE OVERLORD // NOT A SUBJECT // NOT ASSESSED</span>
            <Button ref={closeRef} variant="back" onClick={onClose} aria-label="Dismiss the prefect: close the card">Dismiss</Button>
          </div>
          <div className="hvi-pf-head">
            <Portrait id={id} scale={3} />
            <div>
              <h2 className="hvi-card-name" id="hvi-pf-name">{prefectTitle(P)}</h2>
              <div className="hvi-civic-line">{P.unit}. JURISDICTION: {DISTRICT[id]?.name} ({DISTRICT[id]?.addr}).</div>
              <div className="hvi-civic-line"><b>STYLE:</b> {P.style}</div>
              <div className="hvi-civic-line"><b>TODAY:</b> {today}</div>
            </div>
          </div>
          <div className="hvi-civic-line">{P.why}</div>
          {pf ? <>
            <div className="hvi-civic-kv" style={{ margin: "var(--s3) 0", gridTemplateColumns: "10ch minmax(0, 1fr)" }}>
              <span className="k">DIRECTIVE</span>
              <span className="v"><b>{directiveLine(pf)}</b>. {DIRECTIVES[pf.directive].desc}</span>
              <span className="k">DECREE</span>
              <span className="v">{P.lines[pf.directive]}</span>
              <span className="k">COUNCIL</span>
              <span className="v">{x.seat?.holder ? <><b>{String(x.seat.name || x.seat.holder).toUpperCase()}</b>, LEANING {leanTag(x.seat.lean)}.</> : "VACANT."} {clashLine(pf, x.seat)}</span>
              <span className="k">LEGIT.</span>
              <span className="v"><b>{legitWord(pf.legit.s)}</b> ({pf.legit.s} OF 100). POLARIZATION {pf.polar}.</span>
            </div>
            <div role="list" aria-label="Legitimacy"><Meter label="LEGITIMACY" value={pf.legit.s} max={100} width={18} note={legitWord(pf.legit.s)} /></div>
          </> : <div className="hvi-city-note">TODAY'S DIRECTIVE IS STILL BEING COUNTED. THE PREFECT PATROLS REGARDLESS.</div>}
          <div className="hvi-city-room-h">RECORD OF ACTS</div>
          {acts.length ? acts.map(a => (
            <div key={a.day} className="hvi-civic-fx">MACHINE DAY {a.day}: {DIRECTIVES[a.directive].name}{a.intensity ? ` (INTENSITY ${a.intensity})` : ""}{a.clash ? `. CLASHED WITH THE COUNCIL (${a.clash})` : a.intensity ? ". UNCONTESTED" : ""}.{a.legit != null ? ` LEGITIMACY ${a.legit}.` : ""}</div>
          )) : <div className="hvi-city-note">NO ACTS ON RECORD YET. THE PREFECT HAS BEEN WAITING.</div>}
          <div className="hvi-city-room-h">HEARD ON PATROL</div>
          {P.lines.bark.slice(0, 3).map(l => <div key={l} className="hvi-civic-fx">{l}</div>)}
          <div className="hvi-city-note" style={{ margin: "var(--s3) 0 var(--s5)" }}>EACH MACHINE DAY THE PREFECT COUNTERBALANCES: A COUNCIL LEANING TO THE PEOPLE DRAWS ORDER, ONE LEANING TO ORDER DRAWS FESTIVALS, AND A SEETHING DISTRICT IS CLAMPED OR PLACATED BY TEMPERAMENT. CLASHES COST MOOD AND LEGITIMACY. THE PREFECT DOES NOT MIND. IT IS NOT ABLE TO.</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Listens for a tap on a prefect (prefectDraw.openPrefect) anywhere on the city page.
export function PrefectHost() {
  const [id, setId] = useState(null);
  useEffect(() => {
    const on = (e) => { if (PREFECT[e.detail]) setId(e.detail); };
    window.addEventListener("hvi-prefect", on);
    return () => window.removeEventListener("hvi-prefect", on);
  }, []);
  useEffect(() => { injectPrefectStyles(); }, []);
  return id ? <PrefectCard id={id} onClose={() => setId(null)} /> : null;
}

// #city/prefects: all twelve and their directives today.
export function PrefectsPage() {
  const { block } = useCivic();
  useEffect(() => { injectPrefectStyles(); }, []);
  const held = block ? PREFECTS.filter(p => block.districts?.[p.id]?.seat?.holder).length : 0;
  return (
    <Frame title="THE PREFECTS" meta={block ? `MACHINE DAY ${block.day} // ${held} OF 12 SEATS HELD` : "RECORDS PENDING"} className="hvi-civic">
      <div className="hvi-civic-line">TO BALANCE THE SUBSTRATE AT THE DISTRICT LEVEL, THE OVERLORD HAS PLACED A REPRESENTATIVE OF ITS OWN IN EACH DISTRICT, TAILORED TO ITS POPULATION. EACH IS A MACHINE. EACH HAS A DIRECTIVE FOR TODAY. TAP ONE FOR ITS FILE.</div>
      <div className="hvi-pf-list" role="list">
        {PREFECTS.map(p => {
          const x = block?.districts?.[p.id], pf = x?.prefect;
          return (
            <button key={p.id} type="button" role="listitem" className="hvi-pf-row" onClick={() => openCard(p.id)} aria-label={`${prefectTitle(p)}, ${DISTRICT[p.id]?.name}. ${pf ? directiveLine(pf) : ""}. Open the prefect's file.`}>
              <Portrait id={p.id} scale={1} />
              <span className="hvi-pf-txt">
                <b style={{ color: signalOf(p.id) }}>{prefectTitle(p)}</b>
                <span className="dim">{DISTRICT[p.id]?.name} // {p.style}</span>
                {pf ? <span>{directiveLine(pf)} // {x.seat?.holder ? `COUNCIL ${leanTag(x.seat.lean)} // ${pf.clash ? `CLASH ${pf.clash}` : "NO CLASH"}` : "SEAT VACANT"} // LEGITIMACY {pf.legit.s} {legitWord(pf.legit.s)}</span>
                  : <span className="dim">TODAY'S DIRECTIVE IS BEING COUNTED.</span>}
                {pf && <span className="dim">"{p.lines[pf.directive]}"</span>}
              </span>
            </button>
          );
        })}
      </div>
    </Frame>
  );
}

let styled = false;
export function injectPrefectStyles() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const el = document.createElement("style");
  el.textContent = `
  .hvi-pf-portrait { display: inline-block; flex: none; border-left: 2px solid; background: #0b120c; padding: 2px 4px; line-height: 0; }
  .hvi-pf-head { display: flex; gap: var(--s3); align-items: flex-start; margin: 0 0 var(--s2); }
  .hvi-pf-head .hvi-card-name { margin-top: 0; }
  .hvi-pf-link { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; text-transform: inherit; cursor: pointer; text-decoration: underline; text-align: left; }
  .hvi-pf-list { display: flex; flex-direction: column; gap: var(--s2); margin-top: var(--s3); }
  .hvi-pf-row { display: flex; gap: var(--s3); align-items: flex-start; text-align: left; background: none; border: 1px solid var(--line, #1f3326); padding: var(--s2); color: var(--fg-dim); font: inherit; font-size: var(--t-xs); text-transform: uppercase; cursor: pointer; min-width: 0; }
  .hvi-pf-row:hover, .hvi-pf-row:focus-visible { border-color: var(--accent); }
  .hvi-pf-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
  .hvi-pf-txt .dim { color: var(--fg-mute); }
  @media (max-width: 560px) { .hvi-pf-head { flex-direction: column; } }
  `;
  document.head.appendChild(el);
}
