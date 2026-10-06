// EMERGENCE: the city grows industries of its own (docs/design/EMERGENCE.md; Scott 2026-10-05: "as
// the higher society starts to form and carve itself out, we start to see other jobs forming, other
// economies forming: a transportation industry, transport drones and helicopters flying around the
// city"). Pure: the plan builder (netlify/lib/plans.js) steps it once per machine day, after THE
// MALL and before it builds the day; browsers only read the block the day's summary publishes.
//
//   MEASURE   from yesterday's published plan and its shop register: the population, storefronts
//             trading and the orders their visits imply, the top band's homes (the Meridian's
//             penthouses), the top 5%'s share of a wealth proxy (home band + shop profit; property
//             owners replace it once property exists), the longest district-to-district commute.
//   UNLOCK    an industry opens when its measures hold past thresholds for K days running. Every
//             threshold and K is drawn by hash per industry and per attempt (no number is the
//             trigger twice); it declines only when the measures fall well below (hysteresis),
//             for longer. A decline re-draws the thresholds for the next attempt.
//   JOBS      an open industry staffs itself from the census (fields first, the middle band
//             before the top: a new rung), at an existing building; the jobs ride THE MALL's work
//             map into the plan, so the file and the city agree.
//   ROUTES    what flies is derived from the day's own plan, never a timetable: a drone per shop
//             visit (an order, delivered to the visitor's home after they leave), a helicopter
//             per long trip of the top band, between the rooftop pads.
//
// The state rides the chain: each day's plan from EMERGE_FROM carries `emerge`; the builder keeps
// the latest in a blob (emerge/latest) across a gap. Days before EMERGE_FROM never change.
import * as SIM from "./sim.js";
import { UNITS } from "./enterprise.js";

export const EMERGE_V = 1;
// The first machine day the chain runs (2026-10-06 08:24 UTC). Chosen after the newest published
// plan + LOOKAHEAD + 1 when it shipped (the MARKET_SIM_FROM rule): every published day rebuilds
// byte-identical. Never move it backwards.
export const EMERGE_FROM = 622;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const h01 = (s) => fnv(`${SIM.SEED}|emerge|${s}`) / 4294967296;
const jit = (id, n, name, lo, hi) => lo + h01(`${id}|${n}|${name}`) * (hi - lo);

// ---- where things are (data: existing buildings, nothing new on the ground) ----------------------
// The drone depot: the Parts Depot in the Works. The pads: the Meridian's crown (the penthouses),
// the Reserve Tower's (the Exchange), the Airport's hangar roof, and the other top-band roofs (the
// Surfside on the Coast, Engine Tower A, the Chalets). x, y map cells; h the roof (archGeo massing).
export const DEPOT = { place: "parts-depot", x: 32.8, y: 52, h: 1.6 };
export const PADS = [
  { id: "meridian", name: "THE MERIDIAN", building: "the-meridian", x: 62, y: 9.25, h: 14.3 },
  { id: "reserve", name: "THE RESERVE TOWER", building: "reserve-tower", x: 74.2, y: 4.25, h: 13.8 },
  { id: "airport", name: "THE AIRPORT", building: "the-hangars", x: 268, y: 78.8, h: 2.2 },
  { id: "surfside", name: "THE SURFSIDE", building: "the-surfside", x: 62.8, y: 82.7, h: 7.6 },
  { id: "engine", name: "ENGINE TOWER A", building: "engine-tower-a", x: 142, y: -32.75, h: 14.3 },
  { id: "chalets", name: "THE CHALETS", building: "the-chalets", x: 75.4, y: -17.9, h: 1.6 },
];
export const HOP_FAR = 25;   // cells: two pads nearer than this are a walk (the Meridian to the Reserve Tower)
export const PAD = Object.fromEntries(PADS.map((p, i) => [p.id, { ...p, i }]));
const BAND0 = new Set(SIM.HOMES_BY_BAND[0]);
const BAND1 = new Set(SIM.HOMES_BY_BAND[1]);
const centre = (id) => { const r = SIM.PLACES[id]?.rect; return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null; };

// ---- the industries ------------------------------------------------------------------------------
// Each: its jobs (title, place, shift, fields that suit it), its market hook (a tradable industry
// once THE MARKET adds industries by data: docs/design/EMERGENCE.md "Market"), its lines.
export const INDUSTRIES = {
  drones: {
    name: "DELIVERY DRONES", market: { id: "air-freight", name: "AIR FREIGHT", districts: ["works"] },
    jobs: [
      { id: "drone-dispatcher", title: "Drone Dispatcher", place: "parts-depot", shift: "day", fields: ["computing", "engineering", "electrical", "labor"], dims: ["utility", "adaptability"] },
      { id: "drone-mechanic", title: "Drone Mechanic", place: "parts-depot", shift: "evening", fields: ["engineering", "electrical", "labor", "computing"], dims: ["utility", "physical"] },
    ],
  },
  heli: {
    name: "PRIVATE HELICOPTERS", market: { id: "rotor-charter", name: "ROTOR CHARTER", districts: ["finance", "airport"] },
    jobs: [
      { id: "pilot", title: "Pilot", place: "hangars", shift: "day", fields: ["exploration", "military", "engineering", "sport"], dims: ["adaptability", "physical"] },
      { id: "pad-attendant", title: "Pad Attendant", place: "rooftop-lounge", shift: "day", fields: ["hospitality", "labor", "care"], dims: ["care", "utility"] },
    ],
  },
};
export const JOB_BY_ID = Object.fromEntries(Object.values(INDUSTRIES).flatMap(I => I.jobs.map(j => [j.id, j])));
export const ORDER = ["drones", "heli"];

// The thresholds of an industry's n-th attempt (0-based), drawn by hash. Calibrated against
// production day 607 (840 subjects, 24 storefronts trading, ~180 orders per 1,000, 10 in the
// penthouses, the top 5% holding ~0.19 of the proxy): docs/design/EMERGENCE.md "Calibration".
export function thresholdsOf(id, n = 0) {
  if (id === "drones") return {
    units: Math.round(jit(id, n, "units", 15, 19)),     // storefronts trading
    rate: Math.round(jit(id, n, "rate", 120, 160)),     // orders a day per 1,000 people
    on: 2 + Math.floor(h01(`${id}|${n}|on`) * 2),       // days held to open (2..3)
    off: 5 + Math.floor(h01(`${id}|${n}|off`) * 4),     // days below to decline (5..8)
  };
  return {
    cum: Math.round(jit(id, n, "cum", 5200, 8400)),     // deliveries the drones have flown (the airspace proven)
    ph: Math.round(jit(id, n, "ph", 6, 9)),             // residents in the Meridian's penthouses
    top: +jit(id, n, "top", 0.15, 0.17).toFixed(3),     // the top 5%'s share of the proxy
    on: 2 + Math.floor(h01(`${id}|${n}|on`) * 3),       // 2..4
    off: 6 + Math.floor(h01(`${id}|${n}|off`) * 4),     // 6..9
  };
}

// ---- measuring a day -----------------------------------------------------------------------------
// plan: a format-1 plan (yesterday's), ent: the shop register that day (plan.ent). -> measures
const BAND_W = [10, 3, 1];
export function measureDay(plan, ent = plan?.ent) {
  const P = plan.places, keys = Object.keys(plan.subjects);
  const profit = new Map();
  for (const b of ent?.biz || []) profit.set(b.owner, Math.max(0, b.profit?.[b.profit.length - 1] ?? 0));
  let visits = 0, lux = 0, ph = 0;
  const wealth = [], pair = new Map();
  for (const k of keys) {
    const row = plan.subjects[k], home = P[row[0]];
    const band = BAND0.has(home) ? 0 : BAND1.has(home) ? 1 : 2;
    if (band === 0) lux++;
    if (home === "penthouses") ph++;
    wealth.push(BAND_W[band] + (profit.get(k) || 0) / 20);
    for (const g of SIM.rowSegs(P, row)) {
      if (g.activity === "leisure" && UNITS[g.placeId]) visits++;
      else if (g.activity === "commute") {
        const a = SIM.PLACES[g.fromPlaceId]?.district, b = SIM.PLACES[g.placeId]?.district;
        if (!a || !b || a === b) continue;
        const id = a < b ? `${a}~${b}` : `${b}~${a}`;
        const x = pair.get(id) || pair.set(id, [0, 0]).get(id);
        x[0]++; x[1] += g.to - g.from;
      }
    }
  }
  wealth.sort((a, b) => b - a);
  const total = wealth.reduce((n, w) => n + w, 0), top = wealth.slice(0, Math.max(1, Math.round(wealth.length * 0.05))).reduce((n, w) => n + w, 0);
  let commute = null;
  for (const [id, [n, h]] of pair) if (n >= 20 && (!commute || h / n > commute.h)) commute = { pair: id, n, h: +(h / n).toFixed(2) };
  const pop = keys.length, units = (ent?.biz || []).reduce((n, b) => n + b.units.length, 0);
  return { day: plan.day, pop, units, visits, rate: pop ? Math.round((visits / pop) * 1000) : 0, lux, ph, top: total ? +(top / total).toFixed(3) : 0, commute };
}

// ---- the chain -----------------------------------------------------------------------------------
export function genesis(day) {
  return { v: EMERGE_V, day, ind: Object.fromEntries(ORDER.map(id => [id, { s: "latent", n: 0, on: 0, off: 0, since: null, cum: 0 }])), jobs: {}, m: null, ev: [] };
}
const meets = (id, x, m, st) => {
  const T = thresholdsOf(id, x.n);
  if (id === "drones") return m.units >= T.units && m.rate >= T.rate;
  return st.ind.drones.s === "open" && st.ind.drones.cum >= T.cum && m.ph >= T.ph && m.top >= T.top;
};
const fails = (id, x, m) => {
  const T = thresholdsOf(id, x.n);
  if (id === "drones") return m.units < 0.6 * T.units || m.rate < 0.7 * T.rate;
  return m.ph < 0.6 * T.ph || m.top < 0.85 * T.top;
};
// The because-lines (the Overlord's voice: no living person speaks; nobody is named).
function whyOpen(id, m, st) {
  if (id === "drones") return `THE PARADES FILLED: ${m.units} STOREFRONTS TRADING, ${m.visits} ORDERS A DAY. THE PARTS DEPOT FILED FOR AIRSPACE. DELIVERY DRONES ARE CLEARED OVER THE CITY. THE PAVEMENT IS RELIEVED.`;
  return `THE DRONES FLEW ${st.ind.drones.cum.toLocaleString("en-US")} DELIVERIES WITHOUT INCIDENT. THE TOP 5% NOW HOLD ${Math.round(m.top * 100)}% OF THE CITY'S MEANS. THE MERIDIAN'S PENTHOUSES FILED FOR AIRSPACE. THE DEPARTMENT GRANTED IT, FOR A FEE.`;
}
function whyClose(id) {
  if (id === "drones") return "THE PARADES EMPTIED. THE DRONES ARE GROUNDED AT THE PARTS DEPOT. THE SKY IS QUIET. NOBODY ASKED IT TO BE.";
  return "THE PENTHOUSES EMPTIED. THE HELIPADS ARE CLOSED. THE MERIDIAN TAKES THE LOOP LIKE EVERYONE ELSE.";
}

// Who staffs an open industry: the living, not on the lowest grades, not a citizen, not already
// behind a shop counter; the record's fit first, the middle band before the top (a new rung).
function staff(st, id, n, people, plan, taken) {
  const I = INDUSTRIES[id], want = [];
  for (let i = 0; i < n; i++) want.push(I.jobs[i % I.jobs.length].id);
  const have = Object.entries(st.jobs).filter(([, j]) => JOB_BY_ID[j] && I.jobs.some(x => x.id === j));
  // the ones already holding a post keep it (while there are posts)
  for (const [k] of have.slice(want.length)) delete st.jobs[k];
  const held = new Map();
  for (const [, j] of Object.entries(st.jobs)) held.set(j, (held.get(j) || 0) + 1);
  const need = [];
  for (const j of want) { if ((held.get(j) || 0) > 0) held.set(j, held.get(j) - 1); else need.push(j); }
  if (!need.length) return [];
  const P = plan.places, hired = [];
  for (const j of need) {
    const J = JOB_BY_ID[j];
    let best = null;
    for (const k of Object.keys(plan.subjects)) {
      if (st.jobs[k] || taken.has(k)) continue;
      const s = people.get(k);
      if (!s || SIM.isDead(s) || s.kind === "citizen" || SIM.isLowTier(s)) continue;
      const f = SIM.fieldsOf(s), band = BAND0.has(P[plan.subjects[k][0]]) ? 0 : 1;
      let fit = 0;
      J.fields.forEach((x, i) => { if (f[x]) fit = Math.max(fit, (f[x] / 10) * (i === 0 ? 1 : 0.75)); });
      const dims = SIM.topDims(s);
      const sc = fit * 10 + (J.dims.includes(dims[0]) ? 2 : 0) + (band === 0 ? -3 : 0) + h01(`hire|${j}|${k}|${st.day}`);
      if (!best || sc > best[1]) best = [k, sc];
    }
    if (!best) break;
    st.jobs[best[0]] = j; hired.push(best[0]);
  }
  return hired;
}
const postsFor = (id, m) => (id === "drones" ? clamp(Math.round(m.visits / 50), 1, 3) + 1 : 3);

// The day's state from yesterday's: prev (the state yesterday's plan carries, or a carried ledger
// state, or null), plan (yesterday's format-1 plan with its `ent`, or null: nothing measured),
// people (key -> census subject), day (being built), ent (today's shop register: its owners and
// hands work nowhere else).
export function stepEmergence(prev, plan, people, day, ent = null) {
  const st = prev && prev.v === EMERGE_V ? JSON.parse(JSON.stringify(prev)) : genesis(day);
  st.day = day; st.ev = [];
  const taken = new Set();
  for (const b of ent?.biz || []) { taken.add(b.owner); for (const k of b.staff) taken.add(k); }
  // a file withdrawn, or behind a shop counter today: the post is free again
  for (const k of Object.keys(st.jobs)) if (!people.has(k) || taken.has(k) || !JOB_BY_ID[st.jobs[k]]) delete st.jobs[k];
  const m = plan ? measureDay(plan, plan.ent) : null;
  if (m) { st.m = m; advance(st, m, day); }
  // staff what is open (from the census, deterministic): yesterday's measures size the posts
  for (const id of ORDER) {
    if (st.ind[id].s !== "open" || !plan) continue;
    const hired = staff(st, id, postsFor(id, st.m || m), people, plan, taken);
    if (hired.length) st.ev.push({ k: "hire", id, who: hired.map(k => [k, st.jobs[k]]) });
  }
  return st;
}
// One boundary's unlocks and declines from a day's measures (mutates st; its ev collects the news).
export function advance(st, m, day) {
  for (const id of ORDER) {
    const x = st.ind[id] ||= { s: "latent", n: 0, on: 0, off: 0, since: null, cum: 0 };
    if (x.s === "open") {
      if (id === "drones") x.cum += m.visits;
      x.off = fails(id, x, m) ? x.off + 1 : 0;
      if (x.off >= thresholdsOf(id, x.n).off) {
        x.s = "declined"; x.n++; x.on = 0; x.off = 0; x.until = day;
        for (const [k, j] of Object.entries(st.jobs)) if (INDUSTRIES[id].jobs.some(q => q.id === j)) delete st.jobs[k];
        st.ev.push({ k: "close", id, why: whyClose(id) });
      }
    } else {
      x.on = meets(id, x, m, st) ? x.on + 1 : 0;
      if (x.on >= thresholdsOf(id, x.n).on) {
        x.s = "open"; x.since = day; x.on = 0; x.off = 0;
        st.ev.push({ k: "open", id, why: whyOpen(id, m, st) });
      }
    }
  }
  return st;
}
export const isOpen = (st, id) => st?.ind?.[id]?.s === "open";

// THE MALL's work map with the industries' posts in it (sim.setEnterprise): the jobs ride the plan.
// simDay: enterprise.simDay(ent) (or null); st: the day's state (or null: unchanged, same object).
export function withJobs(simDay, st) {
  const posts = Object.entries(st?.jobs || {}).filter(([, j]) => JOB_BY_ID[j]);
  if (!posts.length) return simDay;
  const work = new Map(simDay?.work || []);
  for (const [k, j] of posts) if (!work.has(k)) work.set(k, simJob(j));
  return { ver: `${simDay?.ver || "-"}|em${fnv(JSON.stringify(posts))}`, work, shops: simDay?.shops || null };
}
const simJob = (j) => { const J = JOB_BY_ID[j]; return { id: J.id, title: J.title, place: J.place, district: SIM.PLACES[J.place].district, shift: J.shift, fields: J.fields, dims: J.dims, ladder: [J.title] }; };

// ---- what flies: derived from the day's own plan -----------------------------------------------
export const DRONE_V = 150, HELI_V = 240;             // cells per machine hour
export const DRONE_ALT = 5.5, HELI_ALT = 21;          // cruise, in the iso's storeys
export const MAX_DRONES = 200, MAX_HOPS = 24, HOP_MIN = 1.2;
// The nearest pad to a place (the penthouses fly from their own roof).
function padFor(placeId) {
  if (placeId === "penthouses") return PAD.meridian.i;
  if (placeId === "surfside") return PAD.surfside.i;
  if (placeId === "engine-tower-a") return PAD.engine.i;
  if (placeId === "chalets") return PAD.chalets.i;
  const c = centre(placeId);
  if (!c) return -1;
  let best = -1, bd = Infinity;
  PADS.forEach((p, i) => { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bd) { bd = d; best = i; } });
  return best;
}
// -> {v, day, ind: {id: {s, since}}, jobs: {key: jobId}, ev, dr: [[unitIdx, homeIdx, t x100]], hp: [[padA, padB, t x100]]}
export function summaryBlock(plan) {
  const st = plan?.emerge;
  if (!st) return null;
  const P = plan.places, dr = [], hp = [];
  for (const [k, row] of Object.entries(plan.subjects)) {
    const home = P[row[0]];
    for (const g of SIM.rowSegs(P, row)) {
      if (isOpen(st, "drones") && g.activity === "leisure" && UNITS[g.placeId] && g.placeId !== home) {
        const t = g.to + 0.15 + h01(`dr|${k}|${plan.day}|${g.placeId}|${g.from}`) * 0.9;
        if (t < 23.5) dr.push([P.indexOf(g.placeId), row[0], Math.round(t * 100), h01(`drk|${k}|${plan.day}|${g.from}`)]);
      }
      if (isOpen(st, "heli") && g.activity === "commute" && BAND0.has(home) && g.to - g.from >= HOP_MIN) {
        const a = padFor(g.fromPlaceId), b = padFor(g.placeId);
        if (a >= 0 && b >= 0 && dist(PADS[a], PADS[b]) >= HOP_FAR) hp.push([a, b, Math.round((g.from + 0.1 + h01(`hp|${k}|${g.from}`) * 0.2) * 100), h01(`hpk|${k}|${plan.day}|${g.from}`)]);
      }
    }
  }
  // bounded: a hashed sample (never the first n of the day), then by time
  const cut = (xs, n) => xs.sort((a, b) => a[3] - b[3]).slice(0, n).map(r => r.slice(0, 3)).sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  return {
    v: EMERGE_V, day: plan.day, ind: Object.fromEntries(ORDER.map(id => [id, { s: st.ind[id].s, since: st.ind[id].since }])),
    jobs: { ...st.jobs }, ev: st.ev, m: st.m ? { units: st.m.units, visits: st.m.visits, ph: st.m.ph, top: st.m.top, commute: st.m.commute } : null,
    dr: cut(dr, MAX_DRONES), hp: cut(hp, MAX_HOPS),
  };
}

// ---- the browser's side: where everything is at machine hour T ------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
// The roof of a place's building, if the massing knows it: the drones land on the step in front.
function placePoint(placeId) { const c = centre(placeId); return c ? { x: c.x, y: c.y, h: 0.6 } : null; }
// One drone's delivery: depot -> the shop (pickup) -> the visitor's home. -> pose | null
function droneAt(day, r, places, T, k) {
  const shop = placePoint(places[r[0]]), home = placePoint(places[r[1]]);
  if (!shop || !home) return null;
  const t0 = (day - 1) * 24 + r[2] / 100;
  const d1 = dist(DEPOT, shop) / DRONE_V, d2 = dist(shop, home) / DRONE_V, hover = 0.04;
  const a = t0 - d1, b = t0 + hover + d2;
  if (T < a || T > b) return null;
  let x, y, hx, hy, alt;
  if (T < t0) { const u = (T - a) / d1; x = lerp(DEPOT.x, shop.x, u); y = lerp(DEPOT.y, shop.y, u); hx = shop.x - DEPOT.x; hy = shop.y - DEPOT.y; alt = DEPOT.h + (DRONE_ALT - DEPOT.h) * ease(u * 5) - (DRONE_ALT - 1.2) * ease((u - 0.8) * 5); }
  else if (T < t0 + hover) { x = shop.x; y = shop.y; hx = home.x - shop.x; hy = home.y - shop.y; alt = 1.2; }
  else { const u = (T - t0 - hover) / d2; x = lerp(shop.x, home.x, u); y = lerp(shop.y, home.y, u); hx = home.x - shop.x; hy = home.y - shop.y; alt = 1.2 + (DRONE_ALT - 1.2) * ease(u * 5) - (DRONE_ALT - home.h) * ease((u - 0.8) * 5); }
  const L = Math.hypot(hx, hy) || 1;
  return { kind: "drone", k, x, y, alt, hx: hx / L, hy: hy / L };
}
function heliAt(day, r, T, k) {
  const A = PADS[r[0]], B = PADS[r[1]];
  if (!A || !B) return null;
  const t0 = (day - 1) * 24 + r[2] / 100, up = 0.05, fly = dist(A, B) / HELI_V, t1 = t0 + up + fly + up;
  if (T < t0 || T > t1) return null;
  let x = A.x, y = A.y, alt;
  const hx0 = B.x - A.x, hy0 = B.y - A.y, L = Math.hypot(hx0, hy0) || 1;
  if (T < t0 + up) alt = A.h + (HELI_ALT - A.h) * ease((T - t0) / up);
  else if (T < t0 + up + fly) { const u = ease((T - t0 - up) / fly); x = lerp(A.x, B.x, u); y = lerp(A.y, B.y, u); alt = HELI_ALT; }
  else { x = B.x; y = B.y; alt = B.h + (HELI_ALT - B.h) * (1 - ease((T - t0 - up - fly) / up)); }
  return { kind: "heli", k, x, y, alt, hx: hx0 / L, hy: hy0 / L, from: A.id, to: B.id };
}
// days: [{b: a day's summary block, places: that day's place list}] (yesterday's and today's, for a
// flight across midnight). The caps: the most drawn at once (reduced motion and phones draw fewer).
export function airAt(days, T, { drones = 14, helis = 4, thin = 1 } = {}) {
  const out = { drones: [], helis: [] };
  for (const { b, places } of days) {
    if (!b || !places) continue;
    (b.dr || []).forEach((r, i) => { if (i % thin || out.drones.length >= drones) return; const p = droneAt(b.day, r, places, T, `${b.day}:${i}`); if (p) out.drones.push(p); });
    (b.hp || []).forEach((r, i) => { if (out.helis.length >= helis) return; const p = heliAt(b.day, r, T, `${b.day}:${i}`); if (p) out.helis.push(p); });
  }
  return out;
}
// Where the pads are drawn: open heli, the day's block.
export const padsOn = (block) => (block?.ind?.heli?.s === "open" ? PADS : []);

// ---- the words -------------------------------------------------------------------------------------
const JOB_WORD = Object.fromEntries(Object.values(JOB_BY_ID).map(j => [j.id, `${j.title.toUpperCase()} // ${(SIM.PLACES[j.place]?.name || j.place).toUpperCase()}`]));
// The file's assignment line for a subject holding a post today (null otherwise).
export const jobWord = (block, key) => (block?.jobs?.[key] ? JOB_WORD[block.jobs[key]] : null);
// The PA: what opened or closed at this boundary, then the standing lines.
export function paLines(block) {
  if (!block) return [];
  const out = [];
  for (const e of block.ev || []) if (e.k === "open" || e.k === "close") out.push(e.why);
  if (block.ind?.drones?.s === "open") out.push(`${(block.dr || []).length} DRONE DELIVERIES SCHEDULED TODAY FROM THE PARTS DEPOT. LOOK UP. THEY ARE LOOKING DOWN.`);
  if (block.ind?.heli?.s === "open") {
    const n = (block.hp || []).length;
    out.push(`${n} HELICOPTER MOVEMENT${n === 1 ? "" : "S"} LOGGED FOR THE ROOFTOP PADS TODAY. NOISE COMPLAINTS FROM THE SPRAWL ARE FILED, IN ORDER OF ARRIVAL.`);
  }
  return out;
}
// NOW IN THE SUBSTRATE: one line while anything is up (or the news, the day it opened).
export function nowLine(block, air) {
  if (!block) return null;
  const news = (block.ev || []).find(e => e.k === "open");
  if (news) return `NEW: ${INDUSTRIES[news.id].name} OVER THE CITY. ${news.id === "heli" ? "HELIPADS ON THE MERIDIAN AND THE RESERVE TOWER." : "THE PARTS DEPOT DISPATCHES."}`;
  const d = air?.drones?.length || 0, h = air?.helis?.length || 0;
  if (!d && !h) return null;
  return `THE AIR: ${d ? `${d} DELIVERY DRONE${d === 1 ? "" : "S"} UP` : ""}${d && h ? ". " : ""}${h ? `${h} HELICOPTER${h === 1 ? "" : "S"} BETWEEN THE PADS` : ""}.`;
}
