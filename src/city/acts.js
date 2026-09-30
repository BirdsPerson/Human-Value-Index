// THE ACTS OF THE ASSEMBLY (docs/PROPOSALS.md): what carried citizen proposals did to the city.
// The acts are data, recorded once in Blobs when a session closes (netlify/lib/proposals.js
// recordAct) and served by /api/proposals; no code is written per proposal. Everything here is
// a pure function of that list, so every viewer sees the same city:
//   RENAME  the district's or building's display name (and a single-room building's room),
//           applied over the original names in the order the acts were carried (the latest
//           rename of a place wins). The plan builder works in ids, never names, so its plans
//           are unchanged by a rename.
//   BUILD   a sign on the target: "APPROVED. AWAITING MATERIALS." (with the style on file when
//           the words match one of the city's architecture styles), and a PA line.
//   POLICY, EVENT   a council act on the record and PA lines.
import { DISTRICTS, BUILDINGS, PLACES } from "./sim.js";

const ORIG = {
  d: Object.fromEntries(DISTRICTS.map(d => [d.id, d.name])),
  b: Object.fromEntries(BUILDINGS.map(b => [b.id, b.name])),
  p: Object.fromEntries(Object.values(PLACES).map(p => [p.id, p.name])),
};
let ACTS = [];
let SIG = "";

// -> true when the city's names changed. Idempotent: the same list always gives the same names.
export function applyActs(acts) {
  const list = (Array.isArray(acts) ? acts : []).filter(a => a && a.sid && a.type).slice().sort((a, b) => a.at - b.at || String(a.sid).localeCompare(String(b.sid)));
  const sig = list.map(a => `${a.sid}:${a.type}:${a.target}:${a.newName || ""}`).join("|");
  if (sig === SIG) return false;
  SIG = sig;
  ACTS = list;
  for (const d of DISTRICTS) d.name = ORIG.d[d.id] ?? d.name;
  for (const b of BUILDINGS) b.name = ORIG.b[b.id] ?? b.name;
  for (const p of Object.values(PLACES)) p.name = ORIG.p[p.id] ?? p.name;
  for (const a of list) {
    if (a.type !== "RENAME" || !a.newName) continue;
    const [kind, id] = String(a.target).split(":");
    if (kind === "d") { const d = DISTRICTS.find(x => x.id === id); if (d) d.name = a.newName; }
    if (kind === "b") {
      const b = BUILDINGS.find(x => x.id === id);
      if (!b) continue;
      // a building that is one room (THE GREEN, THE DIVE) carries its name on the room too
      for (const pid of b.places) if (PLACES[pid] && ORIG.p[pid] === ORIG.b[b.id]) PLACES[pid].name = a.newName;
      b.name = a.newName;
    }
  }
  return true;
}
export const actsNow = () => ACTS.slice();
// Names as the acts left them, for a target id ("city" | "d:<id>" | "b:<id>").
export function nameOf(target) {
  const [kind, id] = String(target).split(":");
  if (kind === "d") return DISTRICTS.find(x => x.id === id)?.name || id;
  if (kind === "b") return BUILDINGS.find(x => x.id === id)?.name || id;
  return "THE WHOLE CITY";
}
// The sign on a place (BUILD acts), newest first: [{no, text}]
export function signsOn(target) {
  return ACTS.filter(a => a.type === "BUILD" && a.target === target).reverse().map(a => ({ no: a.no, text: `${a.title.toUpperCase()}: ${a.effect}` }));
}
// Council acts (POLICY, EVENT) that apply to a district: its own and the city-wide ones.
export function councilActs(districtId = null) {
  return ACTS.filter(a => (a.type === "POLICY" || a.type === "EVENT") && (a.target === "city" || a.district === districtId || !districtId));
}
// PA lines: the latest few acts, in the district they touch (inside one) or anywhere (the map).
export function actPaLines(here = null) {
  const pick = ACTS.filter(a => !here || a.target === "city" || a.district === here).slice(-4).reverse();
  return pick.map(a => {
    const where = a.target === "city" ? "THE CITY" : nameOf(a.target);
    if (a.type === "RENAME") return `BY ACT OF THE ASSEMBLY (${a.no}), ${ORIG_NAME(a.target)} IS NOW ${a.newName}. UPDATE YOUR SENSE OF PLACE.`;
    if (a.type === "BUILD") return `${where}: ${a.title.toUpperCase()}. ${a.effect}`;
    if (a.type === "POLICY") return `COUNCIL ACT ${a.no}, ${where}: ${a.title.toUpperCase()}. ${a.effect}`;
    return `COUNCIL ACT ${a.no}: ${a.title.toUpperCase()} IN ${where}. ${a.effect}`;
  });
}
function ORIG_NAME(target) {
  const [kind, id] = String(target).split(":");
  return (kind === "d" ? ORIG.d[id] : ORIG.b[id]) || id;
}

// The browser's copy: /api/proposals, at most once a minute. Fires "hvi-acts" when the names move.
let at = 0, inflight = null;
export function loadActs({ force = false } = {}) {
  if (typeof fetch !== "function") return Promise.resolve(ACTS);
  if (!force && Date.now() - at < 60000) return Promise.resolve(ACTS);
  if (inflight) return inflight;
  inflight = fetch("/api/proposals", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { at = Date.now(); if (d && applyActs(d.acts)) { try { window.dispatchEvent(new CustomEvent("hvi-acts")); } catch { /* no window */ } } return ACTS; })
    .catch(() => ACTS)
    .finally(() => { inflight = null; });
  return inflight;
}
