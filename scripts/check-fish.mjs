// THE WATERS and THE AQUARIUM (src/play/fish/, netlify/functions/aquarium.js), headless.
//   data         the spots have the river's shape ({id, name, water}) and THE PIER is ocean; every species
//                is valid for its waters (weights, bands, lures, seasons, light); every spot has fish and
//                exactly one legend that lives only there; the weight-length rule is arithmetic only
//   variation    the season, the light and the weather follow the machine clock; appetites change by
//                season and hour (catfish and eels at night, no bluefish in winter, legends keep hours);
//                a night trip on the river hooks more catfish and eels than a midday one
//   determinism  a scripted trip played twice gives the same log and catches; the log alone replays it
//   tension      reeling flat out through a big fish's runs snaps the line; never reeling a small fish
//                lets it throw the hook; the bot, minding the gauge, lands fish on every water
//   verification a genuine catch verifies; a doctored log, a changed claim, another seed, a released fish
//                do not; the cost of replaying a whole two-hour trip in node is printed
//   aquarium     /api/aquarium on in-memory Blobs: a permit, a donation filed only after replay, too fast
//                refused, one donation per fish, the plaque's rule (heavier takes it, the old holder to
//                PREVIOUS RECORDS, first donors kept), the case gate, the rate limit, the purge
//   city         THE PIER (E at the rail, the building's door), the museum's wing, the #play line, the
//                mounted fish in the furniture catalog, the docs
// Run: node scripts/check-fish.mjs
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";

globalThis.__blobs = new Map();
const blobsSrc = `
let n = 0;
export function getStore({ name }) {
  const m = globalThis.__blobs;
  if (!m.has(name)) m.set(name, new Map());
  const s = m.get(name);
  const read = k => (s.has(k) ? JSON.parse(JSON.stringify(s.get(k).data)) : null);
  return {
    async get(k) { return read(k); },
    async getWithMetadata(k) { return s.has(k) ? { data: read(k), etag: s.get(k).etag, metadata: {} } : null; },
    async setJSON(k, v, o = {}) {
      if (o.onlyIfNew && s.has(k)) return { modified: false };
      if (o.onlyIfMatch && (!s.has(k) || s.get(k).etag !== o.onlyIfMatch)) return { modified: false };
      const etag = "e" + ++n; s.set(k, { data: JSON.parse(JSON.stringify(v)), etag }); return { modified: true, etag };
    },
    async delete(k) { s.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...s.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}`;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent(blobsSrc), shortCircuit: true } : next(spec, ctx); } });
const __err = console.error; console.error = console.warn = (...a) => { if (process.env.DEBUG_CHECK) __err(...a); };

const D = await import("../src/play/fish/data.js");
const S = await import("../src/play/fish/sim.js");
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// ==== data ===============================================================================================
ok(D.SPOTS.every(s => typeof s.id === "string" && typeof s.name === "string" && D.WATERS.includes(s.water)), "every spot has the river's shape {id, name, water}");
ok(D.SPOT.pier?.water === "ocean" && D.SPOT.pier.place === "pier" && D.SPOT.pier.building === "the-pier", "THE PIER is ocean, on the coast's pier");
for (const w of D.WATERS) ok(D.SPOTS.some(s => s.water === w), `a spot on ${w} water`);
const lureIds = D.LURES.map(l => l.id);
for (const s of D.SPECIES) {
  ok(s.water.length && s.water.every(w => D.WATERS.includes(w)), `${s.id}: waters valid`);
  ok(s.lb[0] > 0 && s.lb[1] > s.lb[0], `${s.id}: a weight range`);
  ok(s.band[0] >= 0 && s.band[1] <= 1 && s.band[0] < s.band[1], `${s.id}: a depth band inside the water`);
  ok(Object.keys(s.lures).every(k => lureIds.includes(k)) && Object.values(s.lures).some(v => v > 0), `${s.id}: takes at least one of the lures`);
  ok(s.season.length === 4 && s.light.length === 4 && s.season.some(v => v > 0) && s.light.some(v => v > 0), `${s.id}: seasons and hours`);
  ok(s.power > 0 && s.power <= 1.2 && s.stamina > 0 && s.wary >= 0 && s.wary <= 1, `${s.id}: a fight in range`);
  ok(s.art && s.art.shape && s.art.body, `${s.id}: drawn`);
  const lo = D.lengthOf(s, Math.round(s.lb[0] * 100)), hi = D.lengthOf(s, Math.round(s.lb[1] * 100));
  ok(lo > 0 && hi > lo && hi < 1200, `${s.id}: ${lo / 10}-${hi / 10} in by the weight-length rule`);
  if (s.legend) ok(D.SPOT[s.spot] && s.water.includes(D.SPOT[s.spot].water), `${s.id}: a legend of ${s.spot}, in its water`);
}
for (const sp of D.SPOTS) {
  const list = D.speciesAt(sp.id);
  ok(list.filter(s => !s.legend).length >= 3, `${sp.id}: at least three species`);
  ok(list.filter(s => s.legend).length === 1, `${sp.id}: exactly one legend`);
  ok(list.every(s => s.water.includes(sp.water)), `${sp.id}: only fish of its water`);
}
ok(!D.speciesAt("pier").some(s => s.id === "rainbow-trout" || s.id === "pike") && D.speciesAt("river").some(s => s.id === "catfish") && D.speciesAt("estuary").some(s => s.id === "blue-crab"), "trout and pike stay out of the sea; catfish in the river; crabs at the river mouth");
ok(Math.abs(D.cbrt(27) - 3) < 1e-12 && Math.abs(D.cbrt(0.125) - 0.5) < 1e-12, "the cube root is arithmetic and exact enough");
const simSrc = read("../src/play/fish/sim.js") + read("../src/play/fish/data.js");
ok(!/Math\.(random|sin|cos|tan|exp|log|pow|cbrt|atan|hypot)\b|Date\.now|performance\.now|\*\*/.test(simSrc.replace(/\/\/.*$/gm, "")), "the sim uses no random, no clock and no transcendental Math: every engine agrees");

// ==== variation by the machine clock =======================================================================
ok(D.seasonOf(1) === 0 && D.seasonOf(29) === 1 && D.seasonOf(57) === 2 && D.seasonOf(85) === 3 && D.seasonOf(113) === 0, "the water year: four seasons of 28 machine days");
const at0 = D.CITY_EPOCH + 9 * 24 * 60000;   // machine day 10, 00:00
const c6 = D.conditionsAt(at0 + 6 * 60000), c12 = D.conditionsAt(at0 + 12 * 60000), c23 = D.conditionsAt(at0 + 23 * 60000);
ok(c6.day === 10 && c6.hour === 6 && c6.light === 0 && c12.light === 1 && c23.light === 3, "one real minute is one machine hour: dawn at 06, day at 12, night at 23");
ok(D.conditionsAt(at0, 60).minute === 1 && D.conditionsAt(at0, 60 * 60).hour === 1, "a trip's ticks advance the clock: a real second is a machine minute");
ok(D.weatherOn(10) === D.weatherOn(10) && new Set(Array.from({ length: 60 }, (_, i) => D.weatherOn(i + 1))).size >= 4, "the weather is one per machine day, and varies");
const B = D.SPECIES_BY;
const cond = (season, light, weather = "CLEAR") => ({ season, light, weather });
ok(D.appetite(B.catfish, cond(1, 3)) > 3 * D.appetite(B.catfish, cond(1, 1)), "catfish feed at night");
ok(D.appetite(B.eel, cond(1, 3)) > 5 * D.appetite(B.eel, cond(1, 1)), "eels feed at night");
ok(D.appetite(B.bluefish, cond(3, 1)) < 0.1 * D.appetite(B.bluefish, cond(1, 1)), "the bluefish are gone in winter");
ok(D.appetite(B["blue-crab"], cond(3, 1)) === 0 && D.appetite(B["blue-crab"], cond(1, 1)) > 0, "no crabs in winter");
ok(D.appetite(B["ghost-striper"], cond(0, 1)) === 0 && D.appetite(B["ghost-striper"], cond(0, 0)) > 0 && D.appetite(B["ghost-striper"], cond(1, 0)) === 0, "the Silver Striper keeps its hours and its seasons");
ok(D.appetite(B.catfish, cond(1, 3, "RAIN")) > D.appetite(B.catfish, cond(1, 3, "CLEAR")), "rain stirs the catfish");
// a night trip on the river hooks more catfish and eels than a midday one (the spawn follows the hour)
{
  const mix = (hour) => {
    let night = 0, all = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const st = S.newTrip({ seed, spot: "river", at: D.CITY_EPOCH + (29 * 24 + hour) * 60000 });   // day 30: summer
      for (const f of st.fish) { all++; if (f.sp === "catfish" || f.sp === "eel") night++; }
    }
    return night / all;
  };
  const n0 = mix(23), d0 = mix(12);
  ok(n0 > d0 * 2, `river at night: ${(n0 * 100).toFixed(0)}% catfish and eels; at midday ${(d0 * 100).toFixed(0)}%`);
  const sum = (season) => { const sp = new Set(); for (let seed = 1; seed <= 80; seed++) for (const f of S.newTrip({ seed, spot: "pier", at: D.CITY_EPOCH + ((season * 28) * 24 + 12) * 60000 }).fish) sp.add(f.sp); return sp; };
  ok(!sum(3).has("bluefish") && sum(1).has("bluefish"), "the pier: bluefish in summer, none in winter");
}

// ==== determinism and replay ===============================================================================
const AT = D.CITY_EPOCH + (40 * 24 + 18) * 60000;   // day 41, dusk
const cfg = { seed: 0xf15b, spot: "pier", at: AT, player: { name: "SUBJECT TEST" } };
const a = S.autoplay(cfg, 15 * 60 * 60), b = S.autoplay(cfg, 15 * 60 * 60);
ok(a.st.catches.length >= 3, `the bot lands fish off the pier (${a.st.catches.length} in 15 minutes)`);
ok(JSON.stringify(a.log) === JSON.stringify(b.log) && JSON.stringify(a.st.catches) === JSON.stringify(b.st.catches), "the same trip, twice: the same log and the same catches");
const r = S.replay(cfg, a.log);
ok(JSON.stringify(r.catches) === JSON.stringify(a.st.catches) && r.tick === a.st.tick && r.rng === a.st.rng, "the log alone replays the trip tick for tick");
ok(JSON.stringify(S.replay({ ...cfg, player: { name: "SOMEONE ELSE" } }, a.log).catches) === JSON.stringify(a.st.catches), "the player's name changes nothing in the water");
ok(JSON.stringify(S.autoplay({ ...cfg, seed: cfg.seed + 1 }, 15 * 60 * 60).st.catches) !== JSON.stringify(a.st.catches), "another seed, another trip");
for (const spot of ["break", "estuary", "river", "lake"]) {
  const t = S.autoplay({ seed: 77, spot, at: AT }, 15 * 60 * 60);
  ok(t.st.catches.length >= 2 && t.st.catches.every(k => D.speciesAt(spot).some(s => s.id === k.sp)), `${spot}: the bot lands its own water's fish (${t.st.catches.length})`);
}
for (const k of a.st.catches) {
  const s = B[k.sp];
  ok(k.cw >= Math.round(s.lb[0] * 100) && k.cw <= Math.round(s.lb[1] * 100) && k.tl === D.lengthOf(s, k.cw), `catch ${k.n}: ${s.name} ${k.cw / 100} lb, ${k.tl / 10} in, inside its species`);
}

// ==== the tension rules =====================================================================================
// a fish put on the lure and hooked, then held to one input
function hooked(sp, cw, x = 20) {
  const st = S.newTrip({ seed: 5, spot: sp === "bluegill" ? "lake" : "pier", at: AT });
  st.phase = "fishing"; st.t = 0;
  st.bob = { x, d: 3, motion: 0, pop: 0, bare: false, lure: "minnow" };
  st.fish = [{ id: 999, sp, cw, x, d: 3, vx: 0, st: "bite", t: 0, nib: 0, next: 30, life: 9999 }];
  S.step(st, S.BTN.B); st.ev.length = 0;
  return st;
}
{
  let st = hooked("striped-bass", 3800);
  ok(st.phase === "fight", "B on a bite sets the hook");
  for (let i = 0; i < 6000 && st.phase === "fight"; i++) { S.step(st, S.BTN.A); st.ev.length = 0; }
  ok(st.phase === "lost" && st.last.lost === "snap", "reeling a 38 lb striper flat out snaps the line");
  st = hooked("bluegill", 40);
  for (let i = 0; i < 6000 && st.phase === "fight"; i++) { S.step(st, 0); st.ev.length = 0; }
  ok(st.phase === "lost" && st.last.lost === "escape", "never reeling a bluegill: slack, and it throws the hook");
  st = hooked("striped-bass", 3800);
  for (let i = 0; i < 30000 && st.phase === "fight"; i++) { const bb = S.botBits(st); S.step(st, bb); st.ev.length = 0; }
  ok(st.phase === "landed" && st.catches[0]?.sp === "striped-bass" && st.catches[0].cw === 3800, "minding the gauge lands the 38 lb striper");
  // too early: B on a nibble scares it off
  st = hooked("bluegill", 40); st.phase = "fishing"; st.fight = null; st.fish = [{ id: 1, sp: "bluegill", cw: 40, x: 20, d: 3, vx: 0, st: "nibble", t: 0, nib: 2, next: 99, life: 999 }];
  S.step(st, 0); S.step(st, S.BTN.B);
  ok(st.phase === "fishing" && st.fish[0].st === "flee", "setting the hook on a nibble: too early, it leaves");
  // a bite left too long steals the bait
  st = hooked("bluegill", 40); st.phase = "fishing"; st.fight = null; st.bob.lure = "worm"; st.fish = [{ id: 1, sp: "bluegill", cw: 40, x: 20, d: 3, vx: 0, st: "bite", t: 0, nib: 0, next: 20, life: 999 }];
  for (let i = 0; i < 40; i++) S.step(st, 0);
  ok(st.bob.bare && st.fish[0]?.st === "flee", "a bite left too long: the bait is gone");
  // the protected sturgeon is never kept
  st = hooked("sturgeon", 9000);
  for (let i = 0; i < 60000 && st.phase === "fight"; i++) { S.step(st, S.botBits(st)); st.ev.length = 0; }
  if (st.phase === "landed") { for (let i = 0; i < 40; i++) S.step(st, i === 35 ? S.BTN.A : 0); ok(st.catches[0].fate === "release", "THE ATLANTIC STURGEON: A on the card still releases it (protected)"); }
  else ok(true, "the sturgeon got away from the bot (allowed)");
}

// ==== verification =========================================================================================
{
  const k = a.st.catches.find(c => c.fate === "keep");
  const claim = { sp: k.sp, cw: k.cw, tl: k.tl };
  const vcfg = { seed: cfg.seed, spot: cfg.spot, at: cfg.at };
  ok(S.verifyCatch(vcfg, a.log, k.n, claim).ok, "a genuine catch verifies from {seed, spot, at} and the log");
  ok(!S.verifyCatch(vcfg, a.log, k.n, { ...claim, cw: claim.cw + 1 }).ok, "a claim one hundredth of a pound heavier: refused");
  ok(!S.verifyCatch(vcfg, a.log, k.n, { ...claim, sp: "bluefish" === claim.sp ? "fluke" : "bluefish" }).ok, "a claim of another species: refused");
  ok(!S.verifyCatch({ ...vcfg, seed: vcfg.seed + 1 }, a.log, k.n, claim).ok, "the same log under another seed: refused");
  ok(!S.verifyCatch({ ...vcfg, at: vcfg.at + 12 * 60000 }, a.log, k.n, claim).ok, "the same log at another hour: refused");
  // doctored: the hook set on the first catch moved later by a few ticks
  const doc = a.log.slice();
  const firstB = doc.findIndex((v, i) => i % 2 === 0 && v === S.BTN.B);
  doc[firstB - 1] += 25;
  const dv = S.verifyCatch(vcfg, doc, k.n, claim);
  ok(!dv.ok, `a doctored log (the strike moved 25 ticks): refused (${dv.error})`);
  ok(!S.verifyCatch(vcfg, [16, 1, 99, 2], 0, claim).ok && !S.verifyCatch(vcfg, [16], 0, claim).ok && !S.verifyCatch(vcfg, [16, 0], 0, claim).ok, "an illegible log: refused");
  // a released fish cannot be donated
  const rel = (() => { const st = S.newTrip(cfg), log = []; while (st.tick < 15 * 60 * 60 && !st.catches.length || (st.catches.length && !st.catches[0].fate)) { const bb = st.phase === "landed" ? (st.t > 32 && !(st.prev & S.BTN.B) ? S.BTN.B : 0) : S.botBits(st); S.logPush(log, bb); S.step(st, bb); st.ev.length = 0; } return { st, log }; })();
  const rk = rel.st.catches[0];
  ok(rk.fate === "release" && !S.verifyCatch(vcfg, rel.log, 0, { sp: rk.sp, cw: rk.cw, tl: rk.tl }).ok, "a released fish: refused");
  // the cost: a whole two-hour trip replayed in node
  const full = S.autoplay(vcfg, S.TRIP_TICKS);
  const t0 = performance.now();
  const fv = S.verifyCatch(vcfg, full.log, 0, { sp: full.st.catches[0].sp, cw: full.st.catches[0].cw, tl: full.st.catches[0].tl });
  const ms = performance.now() - t0;
  ok(fv.ok && ms < 3000, `a full two-hour trip (${S.TRIP_TICKS} ticks, ${full.log.length} log numbers, ${full.st.catches.length} catches) verifies in ${ms.toFixed(0)} ms`);
  console.log(`  replay cost: ${ms.toFixed(0)} ms for a two-hour trip in node (${(ms / (S.TRIP_TICKS / 3600)).toFixed(1)} ms per real minute of fishing)`);
}

// ==== /api/aquarium =========================================================================================
{
  const ST = await import("../netlify/lib/store.js");
  const AQ = await import("../netlify/lib/aquarium-store.js");
  const fn = (await import("../netlify/functions/aquarium.js")).default;
  const purge = (await import("../netlify/functions/purge.js")).default;
  const HOST = "https://humanvalueindex.com";
  let ipN = 1;
  const call = async (method, body, { q = "", path = "/api/aquarium", f = fn, ip = null } = {}) => {
    const res = await f(new Request(HOST + path + q, method === "GET" ? { method, headers: { origin: HOST } } : { method, headers: { "content-type": "application/json", origin: HOST }, body: JSON.stringify(body) }), { ip: ip || `198.51.100.${ipN++ % 250}` });
    return { status: res.status, body: await res.json() };
  };
  const seed = async (id) => { await ST.updateCase(id, () => ({ caseId: id, created: "2026-10-05", history: [{ score: 500, tier: "MONITORED CIVILIAN" }] })); };
  const A = "HVI-FISHAAAA", Bc = "HVI-FISHBBBB";
  await seed(A); await seed(Bc);
  const store = () => globalThis.__blobs.get("hvi-aquarium");
  const backdate = (id, mins) => { const e = store().get(`c:${id}`); for (const t of e.data.trips) t.at -= mins * 60000; return e.data.trips[0].at; };

  ok((await call("POST", { caseId: "HVI-NOSUCHAA", action: "trip", spot: "pier" })).status === 404, "no such file: no permit");
  ok((await call("POST", { caseId: A, action: "trip", spot: "the-moon" })).status === 404, "no such water: no permit");
  ok((await call("POST", { caseId: A, action: "sell", spot: "pier" })).status === 400, "no such desk (nothing is sold here)");
  const t = await call("POST", { caseId: A, action: "trip", spot: "pier" });
  ok(t.status === 200 && /^[a-f0-9]{20}$/.test(t.body.tripId) && t.body.seed > 0 && Math.abs(t.body.at - Date.now()) < 5000, "a permit: the trip's id, seed and start time come from the server");
  const tcfg = { seed: t.body.seed, spot: "pier", at: t.body.at };
  // play it until two kept fish
  const play = (c, want) => { const st = S.newTrip(c), log = []; while (st.tick < S.TRIP_TICKS && st.catches.filter(k => k.fate).length < want) { const bb = S.botBits(st); S.logPush(log, bb); S.step(st, bb); st.ev.length = 0; } return { st, log }; };
  let g = play(tcfg, 2);
  const k0 = g.st.catches[0], claim0 = { sp: k0.sp, cw: k0.cw, tl: k0.tl };
  let res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: claim0, inputLog: g.log });
  ok(res.status === 422 && /CLOCK/.test(res.body.error), "a log longer than the time since the permit: refused (no fast-forwarding)");
  const at = backdate(A, 60);
  g = play({ ...tcfg, at }, 2);   // the trip as it was really played (the permit's start moved with the backdate)
  const k1 = g.st.catches[0], c1 = { sp: k1.sp, cw: k1.cw, tl: k1.tl };
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: { ...c1, cw: c1.cw + 50 }, inputLog: g.log });
  ok(res.status === 422 && /DOES NOT MATCH/.test(res.body.error), "a claim heavier than the replay: refused");
  const doc = g.log.slice(); const fb = doc.findIndex((v, i) => i % 2 === 0 && v === S.BTN.B); doc[fb] = 0;   // the strike edited out
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: c1, inputLog: doc });
  ok(res.status === 422, "a doctored log: refused");
  res = await call("POST", { caseId: Bc, action: "donate", tripId: t.body.tripId, n: 0, claim: c1, inputLog: g.log });
  ok(res.status === 404, "another file's permit cannot be used");
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: c1, inputLog: g.log });
  ok(res.status === 200 && res.body.filed.record === true && res.body.filed.holder === "SUBJECT AAAA" && res.body.tank.record.cw === c1.cw, `a genuine catch filed: ${res.body.filed?.name} ${c1.cw / 100} LB, the first record`);
  ok(res.body.mine.n === 1 && res.body.mine.records.includes(c1.sp) && !JSON.stringify(res.body).includes(A), "the file's donation and record; the case number is never served");
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: c1, inputLog: g.log });
  ok(res.status === 409, "one donation per fish");
  const k2 = g.st.catches[1];
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 1, claim: { sp: k2.sp, cw: k2.cw, tl: k2.tl }, inputLog: g.log });
  ok(res.status === 200, "the trip's second fish donated too");
  const pub = await call("GET", null);
  ok(pub.status === 200 && pub.body.tanks[c1.sp].record.holder === "SUBJECT AAAA" && !JSON.stringify(pub.body).includes('"k"'), "the tanks, public: names on plaques, no keys");
  const mine = await call("GET", null, { q: `?caseId=${A}` });
  ok(mine.status === 200 && mine.body.mine.n === 2, "MY FILE reads the file's donations");
  // the plaque's rule, pure
  let tanks = {};
  const e = (k, holder, cw) => ({ k, holder, sp: "bluefish", cw, tl: 300, spot: "pier", day: 9, at: "x" });
  tanks = AQ.fileDonation(tanks, e("a", "SUBJECT AAAA", 500)).tanks;
  let fr = AQ.fileDonation(tanks, e("b", "SUBJECT BBBB", 400));
  ok(!fr.record && fr.tanks.bluefish.record.holder === "SUBJECT AAAA" && fr.tanks.bluefish.donors.length === 2, "a lighter fish: in the tank, on the donor list, no plaque");
  fr = AQ.fileDonation(fr.tanks, e("b", "SUBJECT BBBB", 500));
  ok(!fr.record && fr.tanks.bluefish.record.holder === "SUBJECT AAAA", "a tie keeps the holder");
  fr = AQ.fileDonation(fr.tanks, e("b", "SUBJECT BBBB", 777));
  ok(fr.record && fr.beat.holder === "SUBJECT AAAA" && fr.tanks.bluefish.record.holder === "SUBJECT BBBB" && fr.tanks.bluefish.previous[0].holder === "SUBJECT AAAA", "a heavier fish takes the plaque; the old holder moves to PREVIOUS RECORDS");
  ok(fr.tanks.bluefish.donors.length === 2 && fr.tanks.bluefish.donors[0].holder === "SUBJECT AAAA" && fr.tanks.bluefish.n === 4, "the first-donor list keeps each subject once, in order");
  fr = AQ.fileDonation(fr.tanks, e("a", "SUBJECT AAAA", 900));
  ok(fr.tanks.bluefish.previous.map(p => p.holder).join() === "SUBJECT BBBB,SUBJECT AAAA", "previous records, newest first");
  // rate limits: thirty permits an hour per file
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await call("POST", { caseId: Bc, action: "trip", spot: "lake" })).status;
  ok(last === 429, "thirty-one permits in an hour: refused");
  let ipLast = 0;
  for (let i = 0; i < 302; i++) ipLast = (await call("GET", null, { q: `?caseId=${Bc}`, ip: "203.0.113.99" })).status;
  ok(ipLast === 429, "three hundred requests an hour from one address: refused");
  // the purge
  const p = await call("POST", { caseId: A, confirm: A }, { path: "/api/purge", f: purge });
  const after = await call("GET", null);
  ok(p.status === 200 && !store().has(`c:${A}`) && after.body.tanks[c1.sp].record.holder === AQ.PURGED, "a purge deletes the file's angling; its plaques read A PURGED FILE");
  const src = read("../netlify/functions/aquarium.js") + read("../netlify/lib/aquarium-store.js");
  ok(!/hvi-casino|casino-store|wallet|economy-db|CYCLES\b.*credit|stripe|payment/i.test(src.replace(/\/\/.*$/gm, "")), "no money: the aquarium never touches chips, CYCLES or the Treasury");
}

// ==== the city and the docs ==================================================================================
{
  const ctl = read("../src/city/controlIso.js"), bv = read("../src/city/BuildingView.jsx"), app = read("../src/App.jsx");
  ok(/kind: "fish", go: "#fish\?spot=pier"/.test(ctl) && /n\.kind === "fish"/.test(ctl), "E at the pier's rail fishes");
  ok(/"the-pier": \[.*#fish\?spot=pier/.test(bv) && /"city-museum": \[.*#aquarium/.test(bv), "THE PIER's door fishes; the museum's wing is the aquarium");
  ok((app.match(/href: "#fish"/g) || []).length === 1 && /routePath === "#fish"/.test(app) && /routePath === "#aquarium"/.test(app), "#fish and #aquarium routed; one line on #play");
  const { CATALOG } = await import("../src/city/furniture.js");
  ok(CATALOG["mounted-fish"]?.wall === true, "the furniture catalog has a MOUNTED FISH for the wall (data only)");
  const sim = await import("../src/city/sim.js");
  ok(sim.CITY_EPOCH === D.CITY_EPOCH && sim.DEFAULT_SCALE === 60, "the waters keep the city's own clock");
  ok(sim.BUILDING["the-pier"] && sim.BUILDING["city-museum"] && sim.BUILDING["the-break"], "the pier, the break and the museum exist in the city");
  const spec = read("../docs/CITY_SPEC.md"), econ = read("../docs/design/ECONOMY_PROPERTY.md");
  ok(/### Fishing: THE WATERS/.test(spec) && /### THE AQUARIUM/.test(spec), "docs/CITY_SPEC.md documents the waters and the aquarium");
  ok(/Selling fish to the restaurants/.test(econ), "docs/design/ECONOMY_PROPERTY.md designs selling fish (not built)");
  const render = read("../src/play/fish/render.js");
  ok(/never speak/.test(render) && !/say\(|speech|bubble/i.test(render), "the background anglers never speak");
}

console.log(`check-fish: ${n} checks passed`);
