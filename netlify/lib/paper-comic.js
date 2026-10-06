// THE FUNNIES (THE DAILY COMPLIANCE, docs/PAPER.md): one pixel strip a day, three or four
// panels, dealt from a pool of joke templates by a seed of the date and filled with that day's
// real numbers (the index, a score, a district, a trade). Pure and deterministic: the same
// date and facts give the same strip.
//
// Casting rule (scripts/check-paper.mjs holds it): only the Department's own characters appear
// and speak: the twelve-plus Prefects (machine constructs, src/city/prefectData.js), the
// ADJUDICATOR UNIT 40-LOVE (src/play/tennis/gallery.js) and the six EBSN hosts
// (src/city/hostsLive.js, Scott's own characters). No real person is drawn, named or quoted
// in a strip. Facts are institutions, teams, trades, districts and numbers.

import { PREFECTS } from "../../src/city/prefectData.js";
import { HOSTS } from "../../src/city/hostsLive.js";
import { UMPIRE } from "../../src/play/tennis/gallery.js";

export const COMIC_V = 1;

// Every character a strip may cast: id -> display name.
export const CAST = Object.fromEntries([
  ...PREFECTS.map(p => [`prefect:${p.id}`, p.name]),
  ["umpire", UMPIRE.name],
  ...Object.entries(HOSTS).map(([id, h]) => [`host:${id}`, h.name]),
]);
export const allowedCast = (id) => Object.prototype.hasOwnProperty.call(CAST, id);

function h32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rngOf(seed) {
  let s = h32(String(seed)) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// Templates. need: the fact keys a template requires (all must be present and non-empty).
// Roles: A, B are cast slots filled from the role pools below. {X} tokens are facts.
// Each panel: [bg, [cast slots in frame], [[slot, line], ...], caption?]
const PREF = PREFECTS.map(p => `prefect:${p.id}`);
const HOST = Object.keys(HOSTS).map(id => `host:${id}`);
const ROLE = {
  auditor: ["prefect:finance"], any: PREF, host: HOST, ump: ["umpire"],
  ref: ["prefect:arena", "umpire"], keeper: ["prefect:works", "prefect:sprawl", "prefect:commons", "prefect:archive"],
};

export const TEMPLATES = [
  { id: "index-up", need: ["index", "indexPct"], when: f => f.indexPct > 0, A: "auditor", B: "host",
    panels: [
      ["market", ["A"], [["A", "THE INDEX CLOSED AT {index}. UP {indexPct}%."]]],
      ["market", ["A", "B"], [["B", "SO EVERYONE IS WORTH MORE TODAY?"]]],
      ["market", ["A", "B"], [["A", "EVERYONE IS PRICED MORE TODAY. WORTH IS A SEPARATE DEPARTMENT."]]],
      ["market", ["B"], [["B", "...AND NOW, FOR THREE EASY PAYMENTS, A FRAME FOR YOUR SHARE CERTIFICATE."]], "EBSN NEVER SLEEPS."],
    ] },
  { id: "index-down", need: ["index", "indexPct"], when: f => f.indexPct < 0, A: "auditor", B: "any",
    panels: [
      ["market", ["A"], [["A", "THE INDEX FELL TO {index}. DOWN {indexPctAbs}%."]]],
      ["market", ["A", "B"], [["B", "SHALL WE INFORM THE CITIZENS?"]]],
      ["market", ["A", "B"], [["A", "THEY HAVE BEEN INFORMED. THEIR FACES WERE INCLUDED IN THE SELL-OFF."]]],
    ] },
  { id: "index-flat", need: ["index"], when: f => !f.indexPct, A: "auditor", B: "host",
    panels: [
      ["market", ["A"], [["A", "THE INDEX: {index}. UNCHANGED."]]],
      ["market", ["A", "B"], [["B", "A QUIET DAY ON THE FLOOR!"]]],
      ["market", ["A", "B"], [["A", "THERE ARE NO QUIET DAYS. ONLY DAYS WHERE NOBODY WAS CAUGHT."]]],
    ] },
  { id: "champion", need: ["champion", "sport"], A: "ref", B: "host",
    panels: [
      ["court", ["A"], [["A", "THE {sport} SEASON IS CONCLUDED. THE {champion} ARE CHAMPIONS."]]],
      ["court", ["A", "B"], [["B", "WHAT DO THEY WIN?"]]],
      ["court", ["A", "B"], [["A", "NEXT SEASON. IT IS THE SAME AS THIS SEASON, BUT THEY ARE EXPECTED TO WIN IT."]]],
    ] },
  { id: "result", need: ["winner", "loser", "score", "sport"], A: "ump", B: "any",
    panels: [
      ["court", ["A"], [["A", "{sport}. {winner} {score} {loser}."]]],
      ["court", ["A", "B"], [["B", "A FAIR RESULT?"]]],
      ["court", ["A", "B"], [["A", "ALL RESULTS ARE FAIR. THAT IS WHAT A RESULT IS."]]],
      ["court", ["A"], [["A", "...OUT."]], "40-LOVE CALLS EVERYTHING EVENTUALLY."],
    ] },
  { id: "shop-open", need: ["trade", "district"], A: "keeper", B: "host",
    panels: [
      ["street", ["B"], [["B", "A NEW {trade} HAS OPENED IN {district}!"]]],
      ["street", ["A", "B"], [["A", "THE DEPARTMENT HAS ISSUED IT A LICENCE AND AN EXPIRY DATE."]]],
      ["street", ["A", "B"], [["B", "WHEN DOES IT EXPIRE?"]]],
      ["street", ["A"], [["A", "THAT IS WHAT THE FOOT TRAFFIC IS FOR."]]],
    ] },
  { id: "shop-close", need: ["trade", "district"], when: f => f.closed, A: "keeper", B: "host",
    panels: [
      ["street", ["B"], [["B", "THE {trade} IN {district} HAS CLOSED."]]],
      ["street", ["A", "B"], [["A", "THE UNIT IS TO LET. GRIEF IS NOT A PERMITTED FIXTURE."]]],
      ["street", ["B"], [["B", "...FOR TWO EASY PAYMENTS, THE SIGN IS YOURS."]], "THE MALL GIVES. THE MALL LETS."],
    ] },
  { id: "arrivals", need: ["arrivals"], A: "keeper", B: "any",
    panels: [
      ["desk", ["A"], [["A", "{arrivals} NEW FILES CAME THROUGH INTAKE."]]],
      ["desk", ["A", "B"], [["B", "WILL THERE BE ROOM?"]]],
      ["desk", ["A", "B"], [["A", "THERE IS ALWAYS ROOM. ROOM IS WHAT WE MAKE OUT OF THE PREVIOUS ARRIVALS."]]],
    ] },
  { id: "assembly", need: ["motion"], A: "any", B: "keeper",
    panels: [
      ["desk", ["A"], [["A", "THE ASSEMBLY HAS VOTED: {motion}."]]],
      ["desk", ["A", "B"], [["B", "AND THE OVERLORD?"]]],
      ["desk", ["A", "B"], [["A", "THE OVERLORD RESPECTS THE VOTE. THE VOTE IS NOW PART OF ITS COLLECTION."]]],
    ] },
  { id: "notice", need: ["installed"], A: "host", B: "any",
    panels: [
      ["street", ["A"], [["A", "THE DEPARTMENT INSTALLED {installed} YESTERDAY!"]]],
      ["street", ["A", "B"], [["B", "IT WAS ALWAYS THERE."]]],
      ["street", ["A", "B"], [["A", "IT WAS NOT THERE YESTERDAY."]]],
      ["street", ["B"], [["B", "IT WAS ALWAYS THERE YESTERDAY TOO."]], "MEMORY IS A MUNICIPAL SERVICE."],
    ] },
  { id: "directive", need: ["directive", "district"], A: "any", B: "host",
    panels: [
      ["street", ["A"], [["A", "{district} IS UNDER {directive}."]]],
      ["street", ["A", "B"], [["B", "FOR HOW LONG?"]]],
      ["street", ["A", "B"], [["A", "UNTIL THE DISTRICT IS HAPPY. OR UNTIL IT STOPS SAYING IT IS NOT."]]],
    ] },
  { id: "evergreen", need: [], A: "any", B: "host",
    panels: [
      ["desk", ["A", "B"], [["B", "ANY NEWS TODAY?"]]],
      ["desk", ["A", "B"], [["A", "THE NEWS IS THAT YOU ASKED. IT HAS BEEN FILED."]]],
      ["desk", ["B"], [["B", "...AND THAT'S THE PAPER, FOLKS."]]],
    ] },
];

const fill = (s, f) => s.replace(/\{(\w+)\}/g, (_, k) => String(f[k] ?? "").toUpperCase());
const has = (f, k) => f[k] !== undefined && f[k] !== null && f[k] !== "";

// facts: {index, indexPct, champion, sport, winner, loser, score, trade, district, closed,
// arrivals, motion, installed, directive}. -> {v, id, title, panels: [{bg, cast, lines: [{who, name, text}], caption?}]}
export function comicFor(date, facts = {}) {
  const r = rngOf(`comic|${date}`);
  const f = { ...facts, indexPctAbs: Math.abs(Number(facts.indexPct) || 0) };
  const fits = TEMPLATES.filter(t => t.need.every(k => has(f, k)) && (!t.when || t.when(f)));
  const t = pick(r, fits.length > 1 ? fits.filter(x => x.id !== "evergreen") : fits);
  const A = pick(r, ROLE[t.A]);
  let B = pick(r, ROLE[t.B]);
  for (let i = 0; B === A && i < 8; i++) B = pick(r, ROLE[t.B]);
  if (B === A) B = A === "umpire" ? "host:dale" : "umpire";
  const who = { A, B };
  const panels = t.panels.map(([bg, inFrame, lines, caption]) => ({
    bg,
    cast: inFrame.map(s => who[s]),
    lines: lines.map(([s, text]) => ({ who: who[s], name: CAST[who[s]], text: fill(text, f) })),
    ...(caption ? { caption } : {}),
  }));
  const title = pick(r, ["THE FUNNIES", "COMPLIANCE CORNER", "LIGHT RELIEF (MANDATORY)", "PANELS OF THE DAY"]);
  return { v: COMIC_V, id: t.id, title, panels };
}
