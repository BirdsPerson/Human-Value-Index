// THE WATERS and THE AQUARIUM (src/play/fish/, netlify/functions/aquarium.js), headless.
//   data         the spots have the river's shape ({id, name, water}) and THE PIER is ocean; every species
//                is valid for its waters (weights, bands, lures, seasons, light); every spot has fish and
//                exactly one legend that lives only there; the weight-length rule is arithmetic only
//   variation    the season, the light and the weather follow the machine clock; appetites change by
//                season and hour (catfish and eels at night, no bluefish in winter, legends keep hours);
//                a night trip on the river hooks more catfish and eels than a midday one
//   determinism  a scripted trip played twice gives the same log and catches; the log alone replays it
//   simple (v2)  one button: a click's aim rides in the log; A with nothing on reels in; a nibble is
//                not a bite (A on one scares that fish off, the float stays); the bite's window is
//                generous (48 ticks) and A inside it hooks; reel time grows with size (a bluegill in
//                ~2.5 s, a 38 lb striper longer, a legend longest); nothing snaps, letting go only
//                slows it; v2's water spawns exactly v1's fish (odds and sizes comparable)
//   expert (v1)  the frozen v1 sim: reeling flat out through a big fish's runs snaps the line; never
//                reeling a small fish lets it throw the hook; the bot, minding the gauge, lands fish;
//                every trip in scripts/fixtures/fish-v1-trips.json (recorded on v1) replays through
//                replay.js to the same catches, tick count and rng state, and its catches verify as v1
//   verification a genuine catch verifies; a doctored log, a changed claim, another seed, a released fish
//                do not; a v2 log claimed as v1 does not; the cost of a two-hour replay is printed
//   aquarium     /api/aquarium on in-memory Blobs: a permit, a donation filed only after replay (v2, and
//                v1 sent with no version or v 1; an unknown version refused), too fast refused, one donation per fish, the plaque's rule (heavier takes it, the old holder to
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
const V1 = await import("../src/play/fish/v1/sim.js");
const R = await import("../src/play/fish/replay.js");
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; if (process.env.VERBOSE) console.log("  ok", m); };
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
const simSrc = read("../src/play/fish/sim.js") + read("../src/play/fish/v1/sim.js") + read("../src/play/fish/replay.js") + read("../src/play/fish/data.js");
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

// ==== simple (v2): one button ===============================================================================
{
  ok(S.VERSION === 2 && V1.VERSION === 1 && R.simOf(2) === S && R.simOf(1) === V1 && R.versionOf({}) === 1 && R.versionOf({ v: 2 }) === 2 && R.versionOf({ v: 3 }) === null, "two sims by version: v2 one button, v1 frozen; no version reads as v1");
  // the same water: v2 spawns v1's fish, draw for draw
  for (const spot of D.SPOTS.map(x => x.id)) for (const seed of [1, 99, 4242]) {
    const c = { seed, spot, at: AT };
    ok(JSON.stringify(S.newTrip(c).fish) === JSON.stringify(V1.newTrip(c).fish), `${spot} seed ${seed}: v2's water holds v1's fish (species, weights)`);
  }
  // casting: one press, where you aim; a click's aim rides in the log
  const cast = (input) => { const st = S.newTrip({ seed: 3, spot: "pier", at: AT }); for (let i = 0; i < 10; i++) S.step(st, 0); S.step(st, input); return st; };
  let st = cast(S.BTN.A);
  ok(st.phase === "flight" && Math.abs(st.fl.x - S.castX(D.SPOT.pier, 0.6, st.cond.weather)) < 1e-9, "A casts at once, to the aim (no meter)");
  const near = cast(S.BTN.A | S.aimBits(0)), far = cast(S.BTN.A | S.aimBits(1));
  ok(near.fl.x === 4 && far.fl.x > near.fl.x + 30 && far.aim === 1, `a click's aim in the log: near ${near.fl.x} yd, far ${far.fl.x.toFixed(1)} yd`);
  st = S.newTrip({ seed: 3, spot: "pier", at: AT }); for (let i = 0; i < 20; i++) S.step(st, S.BTN.R);
  ok(Math.abs(st.aim - (0.6 + 20 * S.AIM_RATE)) < 1e-9 && st.phase === "ready", "RIGHT held walks the aim out");
  const fishing = (sp, cw, fst = "roam", extra = {}) => {
    const st = S.newTrip({ seed: 5, spot: sp === "bluegill" || sp === "warden" ? "lake" : "pier", at: AT });
    st.phase = "fishing"; st.t = 0; st.prev = 0;
    st.bob = { x: 20, d: 3, motion: 0, pop: 0, bare: false, lure: "minnow", wait: 0 };
    st.fish = [{ id: 999, sp, cw, x: 20, d: 3, vx: 0, st: fst, t: 0, nib: 0, next: 30, life: 9999, ...extra }];
    return st;
  };
  // A with nothing on: reel in, cast again
  st = fishing("bluegill", 40, "roam", { x: 60 });
  S.step(st, S.BTN.A);
  ok(st.phase === "ready" && !st.bob, "A with nothing on the line reels in");
  // a nibble is not a bite
  st = fishing("bluegill", 40, "nibble", { nib: 2, next: 99 });
  S.step(st, 0); S.step(st, S.BTN.A);
  ok(st.phase === "fishing" && st.bob && st.fish[0].st === "flee", "A on a nibble: that fish is scared off, the float stays in");
  // the bite's window
  st = fishing("bluegill", 40, "nibble", { nib: 0, next: 1 });
  let evs = [];
  for (let i = 0; i < 3 && !st.fish.some(f => f.st === "bite"); i++) { S.step(st, 0); evs.push(...st.ev); st.ev.length = 0; }
  ok(st.fish[0].st === "bite" && evs.includes("bite") && evs.includes("splash"), "the bite: the float plunges, a splash and a sound");
  for (let i = 0; i < S.BITE_WINDOW - 4; i++) S.step(st, 0);
  S.step(st, S.BTN.A);
  ok(st.phase === "reel", `A late in the bite's window (${S.BITE_WINDOW} ticks) still hooks`);
  st = fishing("bluegill", 40, "bite", { next: S.BITE_WINDOW });
  for (let i = 0; i < S.BITE_WINDOW + 4; i++) S.step(st, 0);
  ok(st.phase === "fishing" && st.fish[0].st === "flee", "a bite left past the window: it leaves (no stolen bait, cast again)");
  // nibbles come first, a few, before the bite; the waiting draws a far fish in
  st = fishing("bluegill", 40, "roam", { x: 38 });
  let nib = 0, bit = false;
  for (let i = 0; i < 60 * 90 && !bit; i++) { S.step(st, 0); nib += st.ev.filter(e => e === "nibble").length; bit = st.ev.includes("bite"); st.ev.length = 0; }
  ok(bit && nib >= 1, `a fish 18 yards off comes in while you wait: ${nib} nibble(s), then the bite`);
  // the reel: time grows with size; nothing snaps; letting go only slows it
  const reelTime = (sp, cw, hold = () => true) => {
    const st = fishing(sp, cw, "bite", { next: 99 }); S.step(st, S.BTN.A);
    let t = 0; while (st.phase === "reel" && t < 60 * 120) { S.step(st, hold(t) ? S.BTN.A : 0); st.ev.length = 0; t++; }
    return { t, st };
  };
  const small = reelTime("bluegill", 40), mid = reelTime("striped-bass", 800), big = reelTime("striped-bass", 3800), leg = reelTime("warden", 5000);
  ok(small.st.phase === "landed" && big.st.phase === "landed" && leg.st.phase === "landed", "held A lands every fish: no tension bar, no snap");
  ok(small.t < 4 * 60 && small.t < mid.t && mid.t < big.t && big.t < leg.t && leg.t < 16 * 60, `reel time by size: bluegill ${(small.t / 60).toFixed(1)} s, 8 lb striper ${(mid.t / 60).toFixed(1)} s, 38 lb ${(big.t / 60).toFixed(1)} s, THE WARDEN ${(leg.t / 60).toFixed(1)} s`);
  const mash = reelTime("striped-bass", 3800, t => t % 12 < 3);
  ok(mash.st.phase === "landed" && mash.t < big.t * 1.2, `mashing works as well as holding (${(mash.t / 60).toFixed(1)} s)`);
  const idle = reelTime("striped-bass", 3800, () => false);
  ok(idle.st.phase === "reel" && idle.st.fish.some(f => f.st === "hooked"), "never reeling: it waits on the line, never lost");
  ok(big.st.catches[0].sp === "striped-bass" && big.st.catches[0].cw === 3800 && big.st.catches[0].tl === D.lengthOf(B["striped-bass"], 3800), "the catch: species, the weight fixed at spawn, the length by the rule");
  let tugs = 0; { const st = fishing("striped-bass", 3800, "bite", { next: 99 }); S.step(st, S.BTN.A); for (let i = 0; i < 3000 && st.phase === "reel"; i++) { S.step(st, S.BTN.A); tugs += st.ev.filter(e => e === "run").length; st.ev.length = 0; } }
  ok(tugs >= 1 && !reelTimeTugs("bluegill"), `a big fish tugs on the way in (${tugs}); a bluegill does not`);
  function reelTimeTugs(sp) { const st = fishing(sp, 40, "bite", { next: 99 }); S.step(st, S.BTN.A); let n = 0; for (let i = 0; i < 3000 && st.phase === "reel"; i++) { S.step(st, S.BTN.A); n += st.ev.filter(e => e === "run").length; st.ev.length = 0; } return n; }
  // keep / release, as in v1
  st = big.st; for (let i = 0; i < 40; i++) S.step(st, i === 35 ? S.BTN.B : 0);
  ok(st.catches[0].fate === "release" && st.phase === "ready", "B on the card releases");
  const fx = read("../src/play/fish/Fish.jsx");
  ok(/CAST \/ HOOK \/ REEL/.test(fx) && /aimBits/.test(fx) && /EXPERT/.test(fx), "the page: one line of controls (CAST / HOOK / REEL), click-to-aim, the EXPERT toggle");
  ok(/quipFor/.test(fx) && /quipFor/.test(read("../src/play/fish/render.js")), "the catch card carries the Department's one line");
}

// ==== expert (v1): fixtures recorded on v1 replay unchanged ===============================================
{
  const FIX = JSON.parse(read("./fixtures/fish-v1-trips.json"));
  ok(FIX.trips.length >= 5, `${FIX.trips.length} v1 fixture trips`);
  for (const t of FIX.trips) {
    const st = R.replayTrip(R.versionOf(t), t.cfg, t.inputLog);
    ok(R.versionOf(t) === 1 && JSON.stringify(st.catches) === JSON.stringify(t.catches) && st.tick === t.ticks && st.rng === t.rng, `v1 fixture ${t.cfg.spot}: ${t.catches.length} catches, ${t.ticks} ticks, the same to the rng`);
    const k = t.catches.find(c => c.fate === "keep");
    if (k) {
      ok(R.verifyCatchV(1, t.cfg, t.inputLog, k.n, { sp: k.sp, cw: k.cw, tl: k.tl }).ok, `v1 fixture ${t.cfg.spot}: catch ${k.n} verifies as v1`);
      ok(!R.verifyCatchV(2, t.cfg, t.inputLog, k.n, { sp: k.sp, cw: k.cw, tl: k.tl }).ok, `v1 fixture ${t.cfg.spot}: the same claim on v2 is refused`);
    }
  }
}

// ==== expert (v1): the tension rules, on the frozen sim =====================================================================================
// a fish put on the lure and hooked, then held to one input
function hooked(sp, cw, x = 20) {
  const st = V1.newTrip({ seed: 5, spot: sp === "bluegill" ? "lake" : "pier", at: AT });
  st.phase = "fishing"; st.t = 0;
  st.bob = { x, d: 3, motion: 0, pop: 0, bare: false, lure: "minnow" };
  st.fish = [{ id: 999, sp, cw, x, d: 3, vx: 0, st: "bite", t: 0, nib: 0, next: 30, life: 9999 }];
  V1.step(st, V1.BTN.B); st.ev.length = 0;
  return st;
}
{
  let st = hooked("striped-bass", 3800);
  ok(st.phase === "fight", "B on a bite sets the hook");
  for (let i = 0; i < 6000 && st.phase === "fight"; i++) { V1.step(st, V1.BTN.A); st.ev.length = 0; }
  ok(st.phase === "lost" && st.last.lost === "snap", "reeling a 38 lb striper flat out snaps the line");
  st = hooked("bluegill", 40);
  for (let i = 0; i < 6000 && st.phase === "fight"; i++) { V1.step(st, 0); st.ev.length = 0; }
  ok(st.phase === "lost" && st.last.lost === "escape", "never reeling a bluegill: slack, and it throws the hook");
  st = hooked("striped-bass", 3800);
  for (let i = 0; i < 30000 && st.phase === "fight"; i++) { const bb = V1.botBits(st); V1.step(st, bb); st.ev.length = 0; }
  ok(st.phase === "landed" && st.catches[0]?.sp === "striped-bass" && st.catches[0].cw === 3800, "minding the gauge lands the 38 lb striper");
  // too early: B on a nibble scares it off
  st = hooked("bluegill", 40); st.phase = "fishing"; st.fight = null; st.fish = [{ id: 1, sp: "bluegill", cw: 40, x: 20, d: 3, vx: 0, st: "nibble", t: 0, nib: 2, next: 99, life: 999 }];
  V1.step(st, 0); V1.step(st, V1.BTN.B);
  ok(st.phase === "fishing" && st.fish[0].st === "flee", "setting the hook on a nibble: too early, it leaves");
  // a bite left too long steals the bait
  st = hooked("bluegill", 40); st.phase = "fishing"; st.fight = null; st.bob.lure = "worm"; st.fish = [{ id: 1, sp: "bluegill", cw: 40, x: 20, d: 3, vx: 0, st: "bite", t: 0, nib: 0, next: 20, life: 999 }];
  for (let i = 0; i < 40; i++) V1.step(st, 0);
  ok(st.bob.bare && st.fish[0]?.st === "flee", "a bite left too long: the bait is gone");
  // the protected sturgeon is never kept
  st = hooked("sturgeon", 9000);
  for (let i = 0; i < 60000 && st.phase === "fight"; i++) { V1.step(st, V1.botBits(st)); st.ev.length = 0; }
  if (st.phase === "landed") { for (let i = 0; i < 40; i++) V1.step(st, i === 35 ? V1.BTN.A : 0); ok(st.catches[0].fate === "release", "THE ATLANTIC STURGEON: A on the card still releases it (protected)"); }
  else ok(true, "the sturgeon got away from the bot (allowed)");
}

// the log entry whose press set the first hook (v2)
function hookIndex(c, log) { const st = S.newTrip(c); for (let i = 0; i < log.length; i += 2) { let hooked = false; for (let r = 0; r < log[i + 1]; r++) { S.step(st, log[i]); if (st.ev.includes("hook")) hooked = true; st.ev.length = 0; } if (hooked) return i; } return -1; }

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
  const hookAt = hookIndex(vcfg, doc);
  doc[hookAt - 1] += 60;
  const dv = S.verifyCatch(vcfg, doc, k.n, claim);
  ok(hookAt > 0 && !dv.ok, `a doctored log (the strike moved a second late, past the window): refused (${dv.error})`);
  ok(!R.verifyCatchV(1, vcfg, a.log, k.n, claim).ok, "a v2 log claimed as v1: refused");
  ok(!S.verifyCatch(vcfg, [16, 1, S.MAX_BITS + 1, 2], 0, claim).ok && !V1.verifyCatch(vcfg, [16, 1, 99, 2], 0, claim).ok && !S.verifyCatch(vcfg, [16], 0, claim).ok && !S.verifyCatch(vcfg, [16, 0], 0, claim).ok, "an illegible log: refused");
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
  let res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: claim0, inputLog: g.log, v: 2 });
  ok(res.status === 422 && /CLOCK/.test(res.body.error), "a log longer than the time since the permit: refused (no fast-forwarding)");
  const at = backdate(A, 60);
  g = play({ ...tcfg, at }, 2);   // the trip as it was really played (the permit's start moved with the backdate)
  const k1 = g.st.catches[0], c1 = { sp: k1.sp, cw: k1.cw, tl: k1.tl };
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: { ...c1, cw: c1.cw + 50 }, inputLog: g.log, v: 2 });
  ok(res.status === 422 && /DOES NOT MATCH/.test(res.body.error), "a claim heavier than the replay: refused");
  const doc = g.log.slice(), fb = hookIndex({ ...tcfg, at }, doc); doc[fb] = 0;   // the strike edited out
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: c1, inputLog: doc, v: 2 });
  ok(res.status === 422, "a doctored log: refused");
  res = await call("POST", { caseId: Bc, action: "donate", tripId: t.body.tripId, n: 0, claim: c1, inputLog: g.log, v: 2 });
  ok(res.status === 404, "another file's permit cannot be used");
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: c1, inputLog: g.log, v: 2 });
  ok(res.status === 200 && res.body.filed.record === true && res.body.filed.holder === "SUBJECT AAAA" && res.body.tank.record.cw === c1.cw, `a genuine catch filed: ${res.body.filed?.name} ${c1.cw / 100} LB, the first record`);
  ok(res.body.mine.n === 1 && res.body.mine.records.includes(c1.sp) && !JSON.stringify(res.body).includes(A), "the file's donation and record; the case number is never served");
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 0, claim: c1, inputLog: g.log, v: 2 });
  ok(res.status === 409, "one donation per fish");
  const k2 = g.st.catches[1];
  res = await call("POST", { caseId: A, action: "donate", tripId: t.body.tripId, n: 1, claim: { sp: k2.sp, cw: k2.cw, tl: k2.tl }, inputLog: g.log, v: 2 });
  ok(res.status === 200, "the trip's second fish donated too");
  // v1 (EXPERT, and every client before v2): no version, or v 1, replays on the frozen sim
  {
    const t1 = await call("POST", { caseId: A, action: "trip", spot: "lake" });
    const at1 = backdate(A, 60);
    const play1 = (c, want) => { const st = V1.newTrip(c), log = []; while (st.tick < V1.TRIP_TICKS && st.catches.filter(k => k.fate === "keep").length < want) { const bb = V1.botBits(st); V1.logPush(log, bb); V1.step(st, bb); st.ev.length = 0; } return { st, log }; };
    const c1cfg = { seed: t1.body.seed, spot: "lake", at: at1 }, g1 = play1(c1cfg, 2), ks = g1.st.catches.filter(k => k.fate === "keep");
    const cl = (k) => ({ sp: k.sp, cw: k.cw, tl: k.tl });
    // the waters are the same, so a v1 log replayed on v2 now and then lands the same fish at the same
    // index; the endpoint must answer exactly as the v2 replay does
    const asV2 = R.verifyCatchV(2, c1cfg, g1.log, ks[0].n, cl(ks[0])).ok;
    if (asV2) ok(true, "a v1 trip sent as v2: this seed's v2 replay happens to land the same fish (allowed)");
    else {
      res = await call("POST", { caseId: A, action: "donate", tripId: t1.body.tripId, n: ks[0].n, claim: cl(ks[0]), inputLog: g1.log, v: 2 });
      ok(res.status === 422, `a v1 trip sent as v2: refused (${res.status} ${res.body.error})`);
    }
    res = await call("POST", { caseId: A, action: "donate", tripId: t1.body.tripId, n: ks[0].n, claim: cl(ks[0]), inputLog: g1.log, v: 9 });
    ok(res.status === 400, "an unknown sim version: refused");
    res = await call("POST", { caseId: A, action: "donate", tripId: t1.body.tripId, n: ks[0].n, claim: cl(ks[0]), inputLog: g1.log });
    ok(res.status === 200, "a v1 trip with no version (an old client): verified on the frozen sim, filed");
    res = await call("POST", { caseId: A, action: "donate", tripId: t1.body.tripId, n: ks[1].n, claim: cl(ks[1]), inputLog: g1.log, v: 1 });
    ok(res.status === 200, "a v1 trip sent as v 1 (EXPERT): filed");
    ok(t1.body.v === 2 && t1.body.versions.join() === "1,2", "the permit names both sims");
  }
  const pub = await call("GET", null);
  ok(pub.status === 200 && pub.body.tanks[c1.sp].record.holder === "SUBJECT AAAA" && !JSON.stringify(pub.body).includes('"k"'), "the tanks, public: names on plaques, no keys");
  const mine = await call("GET", null, { q: `?caseId=${A}` });
  ok(mine.status === 200 && mine.body.mine.n === 4, "MY FILE reads the file's donations");
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
  ok((read("../src/play/games.js").match(/href: "#fish"/g) || []).length === 1 && /routePath === "#fish"/.test(app) && /routePath === "#aquarium"/.test(app), "#fish and #aquarium routed; one tile on #play (src/play/games.js)");
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

// ---- a casual human (Scott, 2026-10-06: the sports games are too hard) -----------------------------------
// Answers a bite ~250 ms late (+-100 ms), and now and then (1 nibble in 8) jumps the gun on a nibble, which
// scares that fish off. Of all the bites, a casual player should hook at least 80%.
{
  let bites = 0, hooks = 0, landed = 0, trips = 0;
  for (let k = 0; k < 12; k++) {
    let r = (k * 2654435761 + 12345) >>> 0;
    const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return r / 4294967296; };
    const g = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.73;
    const st = S.newTrip({ seed: 900 + k * 37, spot: ["pier", "lake", "river", "estuary"][k % 4], at: Date.UTC(2026, 5 + (k % 4), 12, 6 + (k % 12), 0, 0) });
    let delay = null, jump = null, sawNib = false;
    while (st.phase !== "done" && st.tick < 20 * 60 * 60) {
      let b = 0;
      if (st.phase === "ready") b = st.prev & S.BTN.A || st.t < 12 + Math.round(Math.abs(g()) * 20) ? 0 : S.BTN.A;
      else if (st.phase === "fishing") {
        const bite = st.fish.find(f => f.st === "bite"), nib = st.fish.find(f => f.st === "nibble");
        if (bite) { if (delay == null) delay = Math.max(6, Math.round(15 + g() * 6)); if (bite.t >= delay && !(st.prev & S.BTN.A)) b = S.BTN.A; } else delay = null;
        if (nib && !bite && sawNib && rnd() < 0.125) jump = 8 + Math.floor(rnd() * 10);
        if (jump != null && --jump <= 0) { jump = null; b = S.BTN.A; }
      } else if (st.phase === "reel") b = S.BTN.A;
      else if (st.phase === "landed") b = st.t > 32 && !(st.prev & S.BTN.A) ? S.BTN.A : 0;
      S.step(st, b);
      bites += st.ev.filter(e => e === "bite").length; hooks += st.ev.filter(e => e === "hook").length;
      sawNib = st.ev.includes("nibble");
      st.ev.length = 0;
    }
    landed += st.catches.length; trips++;
  }
  ok(bites >= 20, `the casual bot saw ${bites} bites over ${trips} trips`);
  ok(hooks / bites >= 0.8, `a casual human hooks ${(hooks / bites * 100).toFixed(0)}% of bites (>= 80%): ${hooks} of ${bites}, ${landed} landed`);
}

console.log(`check-fish: ${n} checks passed`);
