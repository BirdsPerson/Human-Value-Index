// THE PREFECTS (docs/CITY_SPEC.md "The Prefects"): the Overlord's own representative in every
// district, set against the elected council seat. Pure (node checks run it); the civic fold
// (civic.js) calls prefectFold once per district per machine day and writes the result into
// the day's summary, so every viewer reads the same directive, clash and legitimacy. The
// patrol is a function of the machine clock and that summary, so every viewer sees the same
// prefect in the same street.
//
//   THE LEAN     one axis, PEOPLE (-100) <-> ORDER (+100). A subject's lean: ORDER is threat,
//                utility and rigidity (100 - adaptability), and a record in the ordering trades
//                (military, law, finance, business, royalty, management, crime); PEOPLE is
//                care and alignment, and a record in the caring ones (activism, care, labour,
//                medicine, education, farming, philosophy, the arts). Citizens (warmth and
//                competence only): competence over warmth. A councillor's lean is where its
//                BACKERS stand against the city: half the holder's own lean, half the mean of
//                the district's workforce that would back it (social.js compat >= ABSTAIN, the
//                Substrate's advisory electorate), each less the city's mean, times LEAN_GAIN.
//                Players' ballots are secret (salted voter keys) and carry no values; a player
//                citizen holding the seat leans by its own file and those backers. Vacant: none.
//   POLARIZATION |lean| plus the mood past the extremes (|raw| over 45). 0..100.
//   THE DIRECTIVE each machine day, from the district's mood (today's raw before the prefect's
//                own factor, so the fold stays recomputable from one day's plan) and the lean:
//                the prefect COUNTERBALANCES. Its target control C = its temper's strictness,
//                less lean / 40 (a PEOPLE council draws ORDER, an ORDER council draws festivals),
//                plus the mood's pull (a seething district: clamp or placate, by temper; a
//                placated one: probe or relax). The directive is the one whose control is
//                nearest C (its preferred instruments first, a hashed day's whim to break ties);
//                intensity 1..5 from |C| and the polarization.
//   THE CLASH    the council lean against the directive's control, when they pull opposite
//                ways: |lean| / 100 x |control| x intensity x 6, 0..100. No council, no clash.
//   MOOD         a new factor, `prefect`: the directive's own weight on the district (a curfew
//                costs, a festival pleases) less clash / 5.
//   LEGITIMACY   the Overlord's standing in the district, 0..100: 50, +12 with an elected
//                council, + mood / 4, - 0.8 x clash, - polarization / 5, - 5 for a heavy hand
//                (intensity 4+ of a control 2+ directive). Smoothed like the mood (0.6 today +
//                0.4 yesterday's raw). The seed of the unrest arc (ROADMAP item e); nothing
//                riots yet.
import * as SIM from "./sim.js";
import { compat } from "./social.js";
import { councilSitting } from "./councilCalendar.js";
import { PREFECT, PREFECTS, DIRECTIVES, DIRECTIVE_IDS } from "./prefectData.js";

export { PREFECT, PREFECTS, DIRECTIVES, DIRECTIVE_IDS };
export const LEAN_GAIN = 2.2, ABSTAIN = 0.05;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// planSplit.js sampleAt (the summary's 30-minute samples), without its browser imports
const sampleAt = (arr, h) => { if (!arr) return 0; const x = Math.max(0, h) / 0.5, k = Math.min(arr.length - 1, Math.floor(x)), f = x - k; return arr[k] + ((arr[Math.min(arr.length - 1, k + 1)] ?? arr[k]) - arr[k]) * f; };
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return h >>> 0;
}
export const h01 = (s) => fnv(`${SIM.SEED}|prefect|${s}`) / 4294967296;

// ---- the lean -------------------------------------------------------------------------------------
const ORDER_FIELDS = { military: 1, law: 0.8, finance: 1, business: 0.8, royalty: 1, management: 0.6, crime: 0.6, politics: 0.3 };
const PEOPLE_FIELDS = { activism: 1, care: 0.9, labor: 0.9, medicine: 0.5, education: 0.6, farming: 0.6, philosophy: 0.4, music: 0.3, visual: 0.3, writing: 0.3 };
// -> -100 (PEOPLE) .. 100 (ORDER)
export function subjectLean(s) {
  const b = s?.kind === "citizen" ? null : s?.breakdown;
  let v;
  if (b && typeof b.care === "number") {
    const people = 0.6 * b.care + 0.4 * num(b.alignment, b.care);
    const order = 0.55 * num(b.threat, 30) + 0.25 * num(b.utility, 50) + 0.2 * (100 - num(b.adaptability, 50));
    v = 1.2 * (order - people);
  } else {
    v = 0.8 * (num(s?.competence, 50) - num(s?.warmth, 50));
  }
  const f = SIM.fieldsOf(s);
  for (const [k, w] of Object.entries(ORDER_FIELDS)) if (f[k]) v += 2 * w * f[k];
  for (const [k, w] of Object.entries(PEOPLE_FIELDS)) if (f[k]) v -= 2 * w * f[k];
  return clamp(Math.round(v), -100, 100);
}
export const LEAN_WORDS = [[40, "HARD ORDER"], [12, "ORDER"], [-11, "CENTRE"], [-39, "PEOPLE"], [-101, "HARD PEOPLE"]];
export const leanWord = (l) => (l == null ? "NONE" : LEAN_WORDS.find(([m]) => l >= m)[1]);
export const leanTag = (l) => (l == null ? "NO LEAN" : l === 0 ? "CENTRE 0" : `${l < 0 ? "PEOPLE" : "ORDER"} ${Math.abs(l)}`);

// The councillors' leans for one day: held: {district: {holder}} (councilCalendar seatsOn),
// people: key -> census subject. -> {district: lean} (only held seats).
export function councilLeans(held, people) {
  const ids = Object.keys(held || {});
  if (!ids.length) return {};
  const holders = new Map(ids.map(id => [id, people.get(held[id].holder) || null]));
  let sum = 0, n = 0;
  const acc = Object.fromEntries(ids.map(id => [id, { sum: 0, n: 0 }]));
  for (const [key, s] of people) {
    if (s?.kind === "citizen") continue;   // players back by ballot (secret), not by likeness
    const l = subjectLean(s);
    sum += l; n++;
    const d = SIM.assignJob(s).district, a = acc[d], h = holders.get(d);
    if (!a || !h || key === held[d].holder) continue;
    if (compat(s, h) >= ABSTAIN) { a.sum += l; a.n++; }
  }
  const mean = n ? sum / n : 0, out = {};
  for (const id of ids) {
    const h = holders.get(id), a = acc[id];
    const own = h ? subjectLean(h) - mean : null, back = a.n ? a.sum / a.n - mean : null;
    const raw = own != null && back != null ? 0.5 * own + 0.5 * back : own ?? back ?? 0;
    out[id] = clamp(Math.round(LEAN_GAIN * raw), -100, 100) || 0;
  }
  return out;
}

// ---- the directive -----------------------------------------------------------------------------------
export const polarization = (lean, raw0) => clamp(Math.abs(lean || 0) + Math.max(0, Math.abs(raw0) - 45), 0, 100);
// -> {directive, intensity, target}
export function chooseDirective(id, day, raw0, lean) {
  const p = PREFECT[id], T = p.temper;
  let C = T.strict - (lean != null ? lean / 40 : 0);
  if (raw0 <= -45) C += T.unrest === "clamp" ? 1.6 : -2;
  else if (raw0 <= -15) C += T.unrest === "clamp" ? 0.8 : -0.8;
  else if (raw0 >= 45) C += T.content === "probe" ? 1 : -0.8;
  C = clamp(C, -2, 3);
  let best = null, bv = Infinity;
  for (const d of DIRECTIVE_IDS) {
    const pi = T.prefs.indexOf(d);
    const v = Math.abs(DIRECTIVES[d].control - C) - (pi === 0 ? 0.45 : pi === 1 ? 0.25 : 0) + 0.35 * h01(`${id}|${day}|${d}`);
    if (v < bv - 1e-12) { bv = v; best = d; }
  }
  const intensity = clamp(1 + Math.round(Math.abs(C) + polarization(lean, raw0) / 50), 1, 5);
  return { directive: best, intensity, target: Math.round(C * 10) / 10 };
}
export function clashOf(lean, directive, intensity) {
  if (lean == null || !lean) return 0;
  const c = DIRECTIVES[directive].control;
  const opp = Math.max(0, -Math.sign(lean) * c);
  return clamp(Math.round((Math.abs(lean) / 100) * opp * intensity * 6), 0, 100);
}
export const moodFactor = (directive, intensity, clash) => clamp(Math.round(DIRECTIVES[directive].mood * (0.6 + 0.2 * intensity)) - Math.round(clash / 5), -25, 6) || 0;
export function legitimacyRaw({ held, raw0, clash, polar, directive, intensity }) {
  const heavy = intensity >= 4 && DIRECTIVES[directive].control >= 2 ? 5 : 0;
  return clamp(Math.round(50 + (held ? 12 : 0) + raw0 / 4 - 0.8 * clash - polar / 5 - heavy), 0, 100);
}
export const LEGIT_WORDS = [[70, "SANCTIONED"], [50, "ACCEPTED"], [30, "QUESTIONED"], [15, "CONTESTED"], [-1, "REPUDIATED"]];
export const legitWord = (s) => LEGIT_WORDS.find(([m]) => s >= m)[1];

// The fold's step for one district: id, day, raw0 (the mood's raw before this factor), lean
// (null: the seat is vacant), prev (yesterday's prefect block or null).
// -> {factor (the mood's `prefect`), block: {directive, intensity, clash, polar, legit: {s, raw, was}, was}}
export function prefectFold(id, day, raw0, lean, prev = null) {
  const held = lean != null;
  const { directive, intensity } = chooseDirective(id, day, raw0, lean);
  const clash = clashOf(lean, directive, intensity);
  const polar = polarization(lean, raw0);
  const raw = legitimacyRaw({ held, raw0, clash, polar, directive, intensity });
  const was = Number.isFinite(prev?.legit?.raw) ? prev.legit.raw : raw;
  const block = { directive, intensity, clash, polar, legit: { s: Math.round(0.6 * raw + 0.4 * was), raw, was } };
  if (prev?.directive && DIRECTIVES[prev.directive]) block.was = prev.directive;
  return { factor: moodFactor(directive, intensity, clash), block };
}

// ---- voice ------------------------------------------------------------------------------------------
// The line a prefect says now: a PA decree, a patrol bark, a clash retort, a mood aside.
export function lineFor(id, x, k = 0) {
  const p = PREFECT[id], L = p.lines, pf = x?.prefect;
  if (!pf) return L.bark[k % L.bark.length];
  const pool = [L[pf.directive], ...L.bark, L[pf.directive]];
  if (pf.clash > 0) pool.push(...L.clash);
  const s = x.mood?.s ?? 0;
  if (s >= 45) pool.push(L.placated);
  if (s <= -45) pool.push(L.seething);
  return pool[k % pool.length];
}
// PA lines for the city page (every district's prefect decree) or a district (its own, fuller).
export function prefectPaLines(block, here = null) {
  if (!block?.districts) return [];
  const out = [];
  const tag = (id) => `PREFECT ${PREFECT[id].code}: `;
  if (here && block.districts[here]?.prefect && PREFECT[here]) {
    const x = block.districts[here], L = PREFECT[here].lines;
    out.push(tag(here) + L[x.prefect.directive]);
    if (x.prefect.clash > 0) out.push(tag(here) + L.clash[x.prefect.clash % 2]);
    out.push(tag(here) + L.bark[(block.day || 0) % L.bark.length]);
    return out;
  }
  for (const p of PREFECTS) {
    const x = block.districts[p.id];
    if (x?.prefect) out.push(tag(p.id) + p.lines[x.prefect.directive]);
  }
  return out;
}

// ---- THE PATROL ----------------------------------------------------------------------------------
// A prefect walks its district from stop to stop, one stop per SLOT machine hours: along the
// streets (sim.footpath) at a stately pace, then stands at the stop, barking. The stop is chosen
// from the machine clock and the day's summary alone (every viewer the same): while the Council
// sits (councilCalendar), every prefect stands in a row before THE ASSEMBLY; during a league or
// pickup game in its district, at the ground; otherwise the busiest building of its district at
// that hour (summary.b), weighted, with its directive's haunts preferred (homes for a curfew or
// wellness checks, workplaces for inspections, leisure for festival permits).
export const SLOT = 0.75, PACE = 0.8;   // machine hours per stop; a fraction of walking pace
const WALK_MAX = 0.62;                   // of a slot, at most, on the move (a far stop is walked faster)
const DPL = Object.fromEntries(SIM.DISTRICTS.map(d => [d.id, SIM.DISTRICT[d.id].places.filter(pid => SIM.PLACES[pid].building)]));
const VENUES = Object.keys(SIM.GAMES);
const HOMEISH = new Set(["home"]), WORKISH = new Set(["work", "mixed"]), FUNISH = new Set(["leisure", "mixed"]);
const HAUNT = { curfew: HOMEISH, wellness: HOMEISH, inspections: WORKISH, permits: FUNISH };
const IDX = Object.fromEntries(PREFECTS.map((p, i) => [p.id, i]));
// A standing spot at a place: in an open lot, on its ground; at a building, the kerb in front.
function spotOf(placeId, id) {
  const p = SIM.PLACES[placeId], b = SIM.BUILDING[p.building];
  if (!b || SIM.OPEN_LOTS.has(b.id)) return { x: p.pos.x + (h01(`${id}|ox|${placeId}`) - 0.5) * Math.min(3, p.rect.w * 0.5), y: p.rect.y + p.rect.h * (0.55 + 0.3 * h01(`${id}|oy|${placeId}`)) };
  const r = b.rect, u = h01(`${id}|kx|${placeId}`);
  // the kerb on the building's most open side (a street, not a neighbour's wall), front first
  const cands = [
    { x: r.x + 0.6 + u * Math.max(0, r.w - 1.2), y: r.y + r.h + 0.3, pref: 0.3 },
    { x: r.x + r.w + 0.3, y: r.y + 0.6 + u * Math.max(0, r.h - 1.2), pref: 0.3 },
    { x: r.x + 0.6 + u * Math.max(0, r.w - 1.2), y: r.y - 0.3, pref: 0 },
    { x: r.x - 0.3, y: r.y + 0.6 + u * Math.max(0, r.h - 1.2), pref: 0 },
  ];
  let best = cands[0], bv = -Infinity;
  for (const c of cands) {
    let d = 3;
    for (const o of SIM.BUILDINGS) {
      if (o.id === b.id || SIM.OPEN_LOTS.has(o.id)) continue;
      const R = o.rect, dx = Math.max(R.x - c.x, 0, c.x - R.x - R.w), dy = Math.max(R.y - c.y, 0, c.y - R.y - R.h);
      d = Math.min(d, Math.hypot(dx, dy));
    }
    const inD = SIM.DISTRICT[p.district].rect, inside = c.x > inD.x - 1 && c.x < inD.x + inD.w + 1 && c.y > inD.y - 1 && c.y < inD.y + inD.h + 1;
    const v = d + c.pref - (inside ? 0 : 5);
    if (v > bv + 1e-9) { bv = v; best = c; }
  }
  return { x: best.x, y: best.y };
}
// Before THE ASSEMBLY while the Council sits: the twelve in a row along its front.
function forumSpot(id) {
  const F = SIM.PLACES.forum.rect, i = IDX[id] ?? 0;
  return { x: F.x + 0.5 + (i + 0.5) * ((F.w - 1) / PREFECTS.length), y: F.y + F.h - 0.2 };
}
const STOPS = new Map();
function remember(map, k, f, cap = 600) {
  if (map.has(k)) return map.get(k);
  const v = f();
  map.set(k, v);
  if (map.size > cap) map.delete(map.keys().next().value);
  return v;
}
// The busiest-weighted pick of slot k (pure: the clock, the summary, the directive).
function pickOf(id, k, summary, dir, salt = "") {
  const list = DPL[id] || [];
  const tMid = (k + 0.5) * SLOT, h = tMid - Math.floor(tMid / 24) * 24;
  const want = HAUNT[dir], night = h >= 22 || h < 6;
  const w = list.map(pid => {
    const p = SIM.PLACES[pid];
    let v = 1 + (summary?.b ? sampleAt(summary.b[p.building], h) || 0 : 0);
    if (want && want.has(p.kind) && (dir !== "curfew" || night)) v *= 2.5;
    return v;
  });
  const tot = w.reduce((a, b) => a + b, 0);
  let r = h01(`${id}|stop${salt}|${k}`) * tot;
  for (let i = 0; i < list.length; i++) if ((r -= w[i]) < 0) return list[i];
  return list[list.length - 1];
}
// The stop of slot k: {place, x, y, why}. summary: that day's summary (or null); block: its civic.
export function stopOf(id, k, summary = null, block = null) {
  const dir = block?.districts?.[id]?.prefect?.directive || null;
  return remember(STOPS, `${id}|${k}|${summary ? summary.day || 1 : 0}|${dir || "-"}`, () => {
    const tMid = (k + 0.5) * SLOT;
    if (councilSitting(tMid)) return { place: "forum", ...forumSpot(id), why: "council" };
    for (const v of VENUES) if (SIM.PLACES[v].district === id && SIM.gameAt(v, tMid)) return { place: v, ...spotOf(v, `${id}|${k % 3}`), why: "game" };
    const list = DPL[id] || [];
    if (!list.length) return { place: null, x: SIM.DISTRICT[id].rect.x + 2, y: SIM.DISTRICT[id].rect.y + 2, why: "post" };
    let pick = pickOf(id, k, summary, dir);
    // a patrol moves on: the same stop twice running is drawn again, once (a crowd still holds it)
    if (list.length > 1 && pick === pickOf(id, k - 1, summary, dir)) pick = pickOf(id, k, summary, dir, "|again");
    return { place: pick, ...spotOf(pick, id), why: summary?.b ? "busy" : "round" };
  });
}
const PATHS = new Map();
const NONE = new Set();
function pathOf(a, b) {
  return remember(PATHS, `${a.x.toFixed(2)},${a.y.toFixed(2)}>${b.x.toFixed(2)},${b.y.toFixed(2)}`, () => {
    const pts = SIM.footpath(a, b, NONE);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return { pts, len };
  });
}
const ANIMS = { council: ["idle", "idle", "point"], game: ["point", "clap", "idle"], busy: ["talk", "point", "idle", "shrug"], round: ["idle", "talk", "point"], post: ["idle"] };
// Where a prefect is at machine time mt. -> {id, x, y, moving, dx, dy, stop, anim, bark (index), k}
export function patrolAt(id, mt, summary = null, block = null) {
  const k = Math.floor(mt / SLOT), t = mt - k * SLOT;
  const A = stopOf(id, k - 1, summary, block), B = stopOf(id, k, summary, block);
  const path = pathOf(A, B);
  const walk = Math.min(WALK_MAX * SLOT, path.len / (SIM.V_WALK * PACE));
  if (t < walk && path.len > 0.05) {
    let d = (t / walk) * path.len;
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1], b = path.pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= L || i === path.pts.length - 1) {
        const f = L ? Math.min(1, d / L) : 1;
        return { id, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, moving: true, dx: (b.x - a.x) / (L || 1), dy: (b.y - a.y) / (L || 1), stop: B, anim: null, k };
      }
      d -= L;
    }
  }
  const list = ANIMS[B.why] || ANIMS.round;
  const beat = Math.floor((t - walk) / (SLOT / 4));   // a new gesture every quarter slot
  const lx = (B.x - A.x) || 1;
  return { id, x: B.x, y: B.y, moving: false, dx: Math.sign(lx), dy: 0, stop: B, anim: list[fnv(`${id}|${k}|${beat}`) % list.length], bark: fnv(`${id}|bark|${k}|${beat}`) % 97, k, beat };
}
// Every prefect now.
export const patrolsAt = (mt, summary = null, block = null) => PREFECTS.map(p => patrolAt(p.id, mt, summary, block));
