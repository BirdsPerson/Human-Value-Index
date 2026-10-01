// THE PREFECTS (src/city/prefects.js, prefectData.js, prefectDraw.js; docs/CITY_SPEC.md "The
// Prefects"). Holds: twelve, one per district (the Coast and the Heights included), no two alike
// (designation, head, build, palette, silhouette, pixels, voice, every line); each line signs
// off in its own voice, 10-20 lines each; no real person appears (no name on file, in the
// synthetic census or among the platforms' figures is in any prefect's words); every sprite is
// cut whole by the shared rig; the directive is a function of mood and lean alone and
// counterbalances the council; the clash and legitimacy math and bounds; the fold with seats
// held stays deterministic, recomputable from one day's plan, and small per district; the patrol
// is a function of the clock, keeps to its district, walks (no jumps) and gathers at THE
// ASSEMBLY while the Council sits. No network. Run: node scripts/check-prefects.mjs
import assert from "node:assert/strict";

const SIM = await import("../src/city/sim.js");
const C = await import("../src/city/civic.js");
const K = await import("../src/city/council.js");
const PF = await import("../src/city/prefects.js");
const D = await import("../src/city/prefectDraw.js");
const R = await import("../src/city/rig.js");
const { FAMOUS_FIGURES } = await import("../src/figures.js");
const { synthRoster } = await import("./synth-roster.mjs");

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const ALL = SIM.DISTRICTS.map(d => d.id);

// ---- 1. twelve, one per district, no two alike ---------------------------------------------------
const P = PF.PREFECTS;
// PHASE 2 (phase2Prefects.js): the Port's and the Old Town's are live; the Suburbs', the Airport's,
// the Farmland's and the Engine's arrive with their districts (dormant until each exists)
const NO_PREFECT_YET = new Set();
eq(P.map(p => p.id).sort(), [...ALL].sort(), "one prefect per district: the Coast, the Heights, the Port, the Old Town and the nightlife quarters included");
const { PHASE2_PREFECTS } = await import("../src/city/phase2Prefects.js");
for (const q of PHASE2_PREFECTS) ok(SIM.DISTRICT[q.id] ? PF.PREFECT[q.id] === q : !PF.PREFECT[q.id], `${q.code}: ${SIM.DISTRICT[q.id] ? "live, its district exists" : "dormant until its district exists"}`);
// the dormant ones are held to the same uniqueness now, so each district's prefect is ready the day it arrives
const PX = [...P, ...PHASE2_PREFECTS.filter(q => !PF.PREFECT[q.id])];
for (const k of ["code", "name", "signoff", "style", "why"]) ok(new Set(PX.map(p => p[k])).size === PX.length, `no two (dormant included) share a ${k}`);
for (const k of ["head", "prop"]) ok(new Set(PX.map(p => p.look[k])).size === PX.length, `no two (dormant included) share a ${k}`);
ok(new Set(PX.map(p => p.look.pal.lens)).size >= PX.length - 1, "no two (dormant included) share a lens, but for the Strip and the Arena's red");
for (const k of ["code", "name", "signoff", "style", "why"]) ok(new Set(P.map(p => p[k])).size === P.length, `no two share a ${k}`);
for (const k of ["head", "prop"]) ok(new Set(P.map(p => p.look[k])).size === P.length, `no two share a ${k}`);
ok(new Set(P.map(p => p.look.pal.body + p.look.pal.lens)).size === P.length && new Set(P.map(p => p.look.pal.lens)).size >= P.length - 1, "palettes differ (body and lens)");
const allLines = [];
for (const p of PX) {
  const L = p.lines, lines = [...PF.DIRECTIVE_IDS.map(d => L[d]), ...L.bark, ...L.clash, L.placated, L.seething];
  ok(lines.every(l => typeof l === "string" && l.length > 4), `${p.code}: every line written`);
  ok(lines.length >= 10 && lines.length <= 20, `${p.code}: ${lines.length} voice lines (10-20)`);
  ok(lines.every(l => l.endsWith(p.signoff)), `${p.code}: every line signs off in its own voice (${p.signoff})`);
  ok(lines.every(l => l === l.toUpperCase() && !/["“”]/.test(l)), `${p.code}: the Overlord's register (caps, no quotation marks)`);
  ok(/^[A-Z]{2,3}-\d{2}$/.test(p.code) && p.name.startsWith("THE "), `${p.code}: a designation, not a name`);
  allLines.push(...lines);
}
ok(new Set(allLines).size === allLines.length, "no line is shared between prefects (or repeated)");

// ---- 2. no real person -------------------------------------------------------------------------
{
  const names = new Set();
  const add = (n) => { const s = String(n || "").toUpperCase().replace(/[^A-Z' -]/g, "").trim(); if (s.length >= 4 && s.includes(" ")) names.add(s); };
  for (const f of FAMOUS_FIGURES) add(f.name);
  for (const s of synthRoster(430)) if (s.kind !== "citizen") add(s.name);
  for (const k of Object.keys(K.PLATFORMS)) add(k.replace(/-/g, " "));
  // distinctive surnames too (6+ letters, not an English word the prefects use)
  const words = new Set(allLines.join(" ").split(/[^A-Z']+/));
  const surnames = new Set([...names].map(n => n.split(" ").pop()).filter(w => w.length >= 6));
  const text = [...allLines, ...P.flatMap(p => [p.code, p.name, p.unit, p.style, p.why])].join(" \n ");
  const hits = [...names].filter(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text));
  eq(hits, [], "no real person's name appears in any prefect's designation or words");
  const sur = [...surnames].filter(w => words.has(w) && !/^(THE|CHAPLAIN|CURATOR|FOREMAN|LIBRARIAN|REFEREE|OFFICER|SENTINEL|PATROL|AUDITOR|PROCTOR)$/.test(w));
  const COMMON = new Set(["CARTER", "CHURCH", "HOUSE", "PARKER", "TAYLOR", "PORTER", "MILLER", "BUTLER", "COOPER", "WARDEN", "BISHOP", "TURNER", "MASTER", "SPRING", "SHEPARD", "MARTIN", "BAKER", "WALKER", "FLOWER", "PRINCE", "STREET", "CASTLE", "WINTER", "SUMMER", "HUNTER", "FISHER", "KNIGHT", "STRONG", "YOUNG", "GARDEN", "HOLDEN", "ROCKET", "SILVER", "GOLDEN", "COUNTS", "LOCKER", "RECORD"]);
  eq(sur.filter(w => !COMMON.has(w)), [], "no distinctive surname on file appears in a prefect's words");
}

// ---- 3. the sprites: unique, machine, rigged ------------------------------------------------------
{
  const sheets = PX.map(p => ({ id: p.id, s: PF.PREFECT[p.id] ? D.prefectSheetRGBA(p.id) : { w: 64, h: 48 }, f0: D.paintPrefect(p.id, 0, p), f1: D.paintPrefect(p.id, 1, p) }));
  const mask = (rgba) => { const m = new Uint8Array(D.PW * D.PH); for (let i = 0; i < m.length; i++) m[i] = rgba[i * 4 + 3] > 0 ? 1 : 0; return m; };
  for (const x of sheets) {
    ok(x.s.w === 64 && x.s.h === 48, `${x.id}: a 2-frame 32x48 sheet`);
    const m = mask(x.f0);
    let top = 48, bottom = -1;
    for (let y = 0; y < 48; y++) for (let c = 0; c < 32; c++) if (m[y * 32 + c]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    ok(top >= 0 && top <= 3 && bottom === 46, `${x.id}: head top at row ${top}, feet on row 46 (the house proportions)`);
    const rig = R.makeRig(x.f0, 32);
    let cut = 0, n = 0;
    for (let i = 0; i < 32 * 48; i++) if (m[i]) { n++; if (rig.sp.label[i]) cut++; }
    ok(cut === n && !rig.sp.empty, `${x.id}: the rig cuts every pixel (${cut}/${n})`);
    ok(x.f0.some((v, i) => v !== x.f1[i]), `${x.id}: the stride differs from the stand`);
    eq(D.paintPrefect(x.id, 0, PX.find(q => q.id === x.id)), x.f0, `${x.id}: painted deterministically`);
  }
  let minPix = 1e9, minMask = 1e9;
  for (let i = 0; i < sheets.length; i++) for (let j = i + 1; j < sheets.length; j++) {
    const a = sheets[i], b = sheets[j], ma = mask(a.f0), mb = mask(b.f0);
    let dm = 0, dp = 0;
    for (let k = 0; k < ma.length; k++) {
      if (ma[k] !== mb[k]) dm++;
      if (a.f0[k * 4] !== b.f0[k * 4] || a.f0[k * 4 + 1] !== b.f0[k * 4 + 1] || a.f0[k * 4 + 2] !== b.f0[k * 4 + 2] || ma[k] !== mb[k]) dp++;
    }
    minMask = Math.min(minMask, dm); minPix = Math.min(minPix, dp);
    ok(dm >= 30, `${a.id} v ${b.id}: silhouettes differ by ${dm} px`);
    ok(dp >= 250, `${a.id} v ${b.id}: pictures differ by ${dp} px`);
  }
  globalThis.__minDiff = [minMask, minPix];
}

// ---- 4. the directive, the clash, legitimacy ------------------------------------------------------
{
  const leans = [null, -100, -60, -25, 0, 25, 60, 100], raws = [-100, -60, -45, -30, -15, 0, 20, 45, 70, 100];
  for (const p of P) for (const day of [300, 301, 777]) for (const l of leans) for (const r of raws) {
    const a = PF.chooseDirective(p.id, day, r, l), b = PF.chooseDirective(p.id, day, r, l);
    eq(a, b, "the directive is a function of (prefect, day, mood, lean)");
    ok(PF.DIRECTIVES[a.directive] && a.intensity >= 1 && a.intensity <= 5, `${p.code}: a directive, intensity 1..5`);
    const c = PF.clashOf(l, a.directive, a.intensity);
    const want = l == null || !l ? 0 : Math.min(100, Math.round(Math.abs(l) / 100 * Math.max(0, -Math.sign(l) * PF.DIRECTIVES[a.directive].control) * a.intensity * 6));
    ok(c === want && c >= 0 && c <= 100, `${p.code}: clash = |lean|/100 x opposing control x intensity x 6 (${c})`);
    const pol = PF.polarization(l, r);
    ok(pol >= 0 && pol <= 100 && pol === Math.min(100, Math.abs(l || 0) + Math.max(0, Math.abs(r) - 45)), "polarization = |lean| + the mood past 45, bounded");
    const g = PF.legitimacyRaw({ held: l != null, raw0: r, clash: c, polar: pol, directive: a.directive, intensity: a.intensity });
    ok(Number.isInteger(g) && g >= 0 && g <= 100, `legitimacy bounded (${g})`);
    const f = PF.moodFactor(a.directive, a.intensity, c);
    ok(Number.isInteger(f) && f >= -25 && f <= 6, "the mood factor is bounded");
  }
  // it counterbalances: across days and prefects, a PEOPLE council draws more control than an ORDER one
  let people = 0, order = 0, vacant = 0;
  for (const p of P) for (let day = 1; day <= 60; day++) {
    people += PF.DIRECTIVES[PF.chooseDirective(p.id, day, 0, -80).directive].control;
    order += PF.DIRECTIVES[PF.chooseDirective(p.id, day, 0, 80).directive].control;
    vacant += PF.DIRECTIVES[PF.chooseDirective(p.id, day, 0, null).directive].control;
  }
  ok(people > vacant && vacant > order, `the prefect counterbalances the council (mean control ${(people / 720).toFixed(2)} v ${(vacant / 720).toFixed(2)} v ${(order / 720).toFixed(2)})`);
  // temperament: the Works clamps a seething district, the Arts placates it
  ok(PF.DIRECTIVES[PF.chooseDirective("works", 5, -80, null).directive].control >= 2 && PF.DIRECTIVES[PF.chooseDirective("arts", 5, -80, null).directive].control <= 0, "the Works clamps down, the Arts hands out permits");
  // variety: over a season every prefect issues more than one directive
  for (const p of P) ok(new Set(Array.from({ length: 28 }, (_, i) => PF.chooseDirective(p.id, 300 + i, (i * 37) % 120 - 60, i % 3 ? null : -40).directive)).size >= 2, `${p.code}: more than one directive in a season`);
  // the whole city's directives today are not all the same
  ok(new Set(P.map(p => PF.chooseDirective(p.id, 400, -20, null).directive)).size >= 3, "the prefects do not all do the same thing");
  // vacant: no clash; legitimacy smoothing
  const v = PF.prefectFold("arts", 10, -20, null, null);
  ok(v.block.clash === 0 && v.block.legit.was === v.block.legit.raw, "a vacant seat: no clash; no yesterday, legitimacy's yesterday is today");
  const w = PF.prefectFold("arts", 11, -20, -90, v.block);
  ok(w.block.legit.was === v.block.legit.raw && w.block.legit.s === Math.round(0.6 * w.block.legit.raw + 0.4 * w.block.legit.was) && w.block.was === v.block.directive, "legitimacy: 0.6 today + 0.4 yesterday's raw; yesterday's directive kept");
}

// ---- 5. the fold with seats held: lean, determinism, recompute, size -----------------------------------
{
  const roster = synthRoster(430);
  const people = new Map(roster.map(s => [SIM.keyOf(s), s]));
  SIM.clearPlans(); SIM.clearSocialSnapshots(); SIM.setCivic(null); SIM.setRoster(roster);
  const sl = K.slate(roster);
  const closeAt = SIM.CITY_EPOCH + 100 * K.MS_PER_DAY;
  const sd = K.seatDayOf(closeAt);
  const seats = {};
  for (const id of ALL.filter((_, i) => i % 6 !== 5)) if (sl[id]?.length) seats[id] = { key: sl[id][0].key, name: sl[id][0].name, by: "substrate" };
  // a player citizen holds one seat
  const cit = roster.find(s => s.kind === "citizen");
  const citD = SIM.assignJob(cit).district;
  seats[citD] = { key: SIM.keyOf(cit), name: "Subject TEST", by: "players" };
  C.setSeats([{ cycle: 1, closeAt, seats }]);
  const days = [sd, sd + 1, sd + 2];
  const plans = new Map(days.map(d => [d, clone(SIM.buildPlan(d))]));
  const chain = new Map();
  let prev = null;
  for (const d of days) { prev = C.civicFold(plans.get(d), people, prev); chain.set(d, prev); }
  const b = chain.get(sd + 1);
  const leansSeen = [];
  for (const id of ALL) {
    const x = b.districts[id];
    if (NO_PREFECT_YET.has(id)) { ok(!x.prefect, `${id}: no prefect yet, no prefect block`); continue; }
    ok(x.prefect && PF.DIRECTIVES[x.prefect.directive], `${id}: a prefect block with a directive`);
    if (seats[id]) {
      ok(x.seat.status === "HELD" && Number.isInteger(x.seat.lean) && x.seat.lean >= -100 && x.seat.lean <= 100, `${id}: a held seat carries a lean (${x.seat.lean})`);
      leansSeen.push(x.seat.lean);
    } else ok(x.seat.status === "VACANT" && x.prefect.clash === 0 && !("lean" in x.seat), `${id}: vacant, no lean, no clash`);
    // the fold's prefect equals the pure step on the mood before its factor
    const raw0 = Math.max(-100, Math.min(100, Object.entries(x.mood.f).filter(([k]) => k !== "prefect").reduce((n, [, v]) => n + v, 0)));
    const re = PF.prefectFold(id, sd + 1, raw0, seats[id] ? x.seat.lean : null, chain.get(sd).districts[id].prefect);
    eq(x.prefect, re.block, `${id}: the recorded directive is the one mood and lean choose`);
    ok(x.mood.f.prefect === re.factor, `${id}: the clash and directive feed the mood (${x.mood.f.prefect})`);
    ok(JSON.stringify(x.prefect).length + JSON.stringify(x.seat.lean ?? "").length < 170, `${id}: the prefect adds ${JSON.stringify(x.prefect).length} bytes to the district`);
  }
  ok(b.districts[citD].seat.holder === SIM.keyOf(cit), "a player citizen may hold a seat and lean");
  ok(new Set(leansSeen).size >= 3, `the councils do not all lean alike (${leansSeen.join(", ")})`);
  globalThis.__leans = leansSeen;
  eq(C.civicFold(clone(plans.get(sd + 1)), new Map(clone(roster).map(s => [SIM.keyOf(s), s])), clone(chain.get(sd))), b, "deterministic with seats held");
  for (const d of days.slice(1)) eq(C.civicFold(plans.get(d), people, C.civicFold(plans.get(d - 1), people, null)), chain.get(d), `day ${d}: recomputing a missing yesterday equals the chain (with the prefects)`);
  // the lean moves with who backs the seat: a PEOPLE-heavy file seated in the same district leans further to PEOPLE than an ORDER-heavy one
  const id0 = Object.keys(seats)[0];
  const byLean = roster.filter(s => s.kind !== "citizen" && s.breakdown).sort((a, c) => PF.subjectLean(a) - PF.subjectLean(c));
  const lo = PF.councilLeans({ [id0]: { holder: SIM.keyOf(byLean[0]) } }, people)[id0], hi = PF.councilLeans({ [id0]: { holder: SIM.keyOf(byLean[byLean.length - 1]) } }, people)[id0];
  ok(lo < hi, `the lean follows the holder and its backers (${lo} < ${hi})`);
  // size and cost at 5,000 with every seat held
  const r5 = synthRoster(5000, { rich: true }), p5 = new Map(r5.map(s => [SIM.keyOf(s), s]));
  SIM.clearPlans(); SIM.setMemoCap(300000); SIM.setRoster(r5);
  const all = {};
  const sl5 = K.slate(r5);
  for (const id of ALL) if (sl5[id]?.length) all[id] = { key: sl5[id][0].key, name: sl5[id][0].name, by: "substrate" };
  C.setSeats([{ cycle: 1, closeAt, seats: all }]);
  const plan5 = SIM.buildPlan(sd);
  const t0 = performance.now();
  const b5 = C.civicFold(plan5, p5, null);
  const ms = performance.now() - t0;
  const per = JSON.stringify(b5).length / ALL.length;
  ok(per < 1000, `5,000 subjects, every seat held: ${Math.round(per)} bytes per district`);
  ok(ms < 3000, `the fold with ${P.length} leans at 5,000: ${Math.round(ms)} ms`);
  globalThis.__fold = [Math.round(per), Math.round(ms)];
  C.setSeats([]); SIM.setRoster(roster);
}

// ---- 6. the patrol --------------------------------------------------------------------------------
{
  const inDistrict = (id, x, y, m = 3) => { const r = SIM.DISTRICT[id].rect; return x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m; };
  const day = 400;
  let maxStep = 0, sat = 0, off = 0, n = 0;
  for (const p of P) {
    let last = null;
    for (let i = 0; i < 24 * 60; i++) {
      const mt = (day - 1) * 24 + i / 60;
      const a = PF.patrolAt(p.id, mt);
      eq(a, PF.patrolAt(p.id, mt), "the patrol is a function of the clock");
      if (last) maxStep = Math.max(maxStep, Math.hypot(a.x - last.x, a.y - last.y));
      last = a;
      n++;
      const sitting = K.councilSitting(mt);
      const forumish = a.stop.why === "council" || PF.stopOf(p.id, a.k - 1).why === "council";
      if (!forumish && !inDistrict(p.id, a.x, a.y)) off++;
      if (sitting && !a.moving && a.stop.why === "council") sat++;
    }
  }
  ok(off === 0, `every prefect keeps to its district (${off} of ${n} minutes outside)`);
  ok(maxStep < 4, `the patrol walks: at most ${maxStep.toFixed(2)} cells a machine minute (no jumps)`);
  // a Council day: machine Tuesday 10:00-13:00, every prefect stands before THE ASSEMBLY
  let tue = 400; while (SIM.weekdayOf(tue) !== 2) tue++;
  const at = (tue - 1) * 24 + 11.9;
  const row = P.map(p => PF.patrolAt(p.id, at));
  const F = SIM.PLACES.forum.rect;
  ok(row.every(a => !a.moving && a.stop.why === "council" && Math.abs(a.y - (F.y + F.h - 0.2)) < 1e-9 && a.x > F.x && a.x < F.x + F.w), `while the Council sits, all ${P.length} stand in a row before THE ASSEMBLY`);
  ok(new Set(row.map(a => a.x.toFixed(2))).size === P.length, "each in its own place in the row");
  // a busy summary pulls the patrol toward the crowd
  const id = "strip", bld = SIM.PLACES["casino"].building;
  const busy = { day, b: { [bld]: Array(48).fill(400) } };
  let hits = 0, base = 0;
  for (let k = 0; k < 200; k++) { if (PF.stopOf(id, 5000 + k, busy).place === "casino") hits++; if (PF.stopOf(id, 5000 + k, null).place === "casino") base++; }
  ok(hits > base * 2, `the patrol converges on the busy place (${hits} v ${base} stops of 200)`);
  // the voice: the line a prefect says comes from its own lines
  for (const p of P) for (let k = 0; k < 30; k++) ok(PF.lineFor(p.id, { prefect: { directive: "curfew", clash: 5 }, mood: { s: -60 } }, k).endsWith(p.signoff), `${p.code}: speaks in its own voice`);
  const pa = PF.prefectPaLines({ day, districts: Object.fromEntries(P.map(p => [p.id, { prefect: { directive: "decree", clash: 0 } }])) });
  ok(pa.length === P.length && pa.every((l, i) => l.startsWith(`PREFECT ${P[i].code}: `)), "the PA reads every prefect's decree, by designation");
}

console.log(`check-prefects: ${checks} checks passed. sprites differ pairwise by >= ${globalThis.__minDiff[0]} silhouette px / ${globalThis.__minDiff[1]} px. council leans (430, held): ${globalThis.__leans.join(", ")}. fold at 5k, all held: ${globalThis.__fold[0]} B/district, ${globalThis.__fold[1]} ms.`);
