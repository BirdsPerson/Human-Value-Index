// THE MOUNTAIN, skiable (src/play/ski/): the sim, the world and the challenges, headless.
//   purity       sim.js uses no clock, no Math.random, no trig, no Math.hypot / pow / exp
//   world        built from the city's mountain: every trail, lift, kicker, rail, the pipe, the pool;
//                the ground deterministic (the same height twice), the trees off the groomed trails
//   determinism  a bot's giant slalom replays from {v, ch, board, inputLog} to the same result, twice;
//                the RLE log round-trips; a doctored log does not reproduce; another version is refused
//   physics      steeper is faster; a carved zigzag keeps more speed than the same zigzag skidded;
//                a clean jump lands, an over-rotated one and one still grabbing wipe out
//   tricks       a spin scores as its half-turns, a flip as a flip; the names say so
//   travel       fast travel only to places found (and a challenge's flag only once found); passing
//                near a place finds it
//   lifts        the wait at the foot is at most one car's interval; the ride takes the line's length
//                at the lift's speed (a held A, a sixth of it); the rider is put off at the top
//   records      the results shape the newspaper reads; the tile and the route exist
//   unchanged    the challenges ski exactly as version 1 did (pinned runs): old records and the boards
//   rookie       ROOKIE holds a green to a steady speed in free ride, and never touches a challenge
//   first-timer  a bot with no map knowledge, reading only what the screen shows (the objective
//                arrow, the hint, the big prompt), gets from the base to a lift, up it, and into a
//                challenge, each step in time; and from every place on the mountain the guidance
//                leads to a lift or a flag
// Run: node scripts/check-ski.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const S = await import("../src/play/ski/sim.js");
const W = await import("../src/play/ski/world.js");
const C = await import("../src/play/ski/challenges.js");
const G = await import("../src/city/mountainGeo.js");
let n = 0;
const ok = (msg) => { n++; if (process.env.VERBOSE) console.log("ok", msg); };

// ---- purity -------------------------------------------------------------------------------------------
{
  const src = readFileSync(new URL("../src/play/ski/sim.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  for (const bad of ["Math.random", "Date.now", "performance", "Math.sin", "Math.cos", "Math.tan", "Math.atan", "Math.hypot", "Math.pow", "Math.exp", "Math.log", "**", "document", "window"]) assert.ok(!src.includes(bad), `sim.js uses ${bad}`);
  ok("purity");
}

// ---- the world ------------------------------------------------------------------------------------------
{
  assert.equal(W.RUNS.length, G.TRAILS.length, "every trail of the city's mountain is skiable");
  assert.equal(W.LIFTS_W.length, G.LIFTS.length, "every lift rides");
  for (const R of W.RUNS) { const [x, y] = W.polyAt(R, R.len / 2), sf = W.surfaceAt(x, y); assert.equal(W.RUNS[sf.trail]?.id, R.id === "the-gauntlet" || R.join ? W.RUNS[sf.trail]?.id : R.id, `the middle of ${R.id} reads as its own trail`); }
  assert.ok(W.KICKERS.length >= 4 && W.RAILS.length === 3 && W.PIPE.len > 400, "the park: kickers, rails, the pipe");
  const h1 = W.heightAt(2000.5, -3000.25), h2 = W.heightAt(2000.5, -3000.25);
  assert.equal(h1, h2);
  // the ground is the city's (within the sample's quantum and the bilinear's reach)
  for (const [cx, cy] of [[46, -93], [30, -24], [60, -76]]) { const d = Math.abs(W.baseH(cx * W.CELL, cy * W.CELL) - G.terrainH(cx, cy) * W.STOREY); assert.ok(d < 1.5, `ground at ${cx},${cy} off by ${d}`); }
  // a kicker stands H over the ground at its lip; the pipe is dug R deep
  const K = W.KICKERS[0]; assert.ok(Math.abs(W.heightAt(K.x, K.y) - W.baseH(K.x, K.y) - K.H) < 0.05, "a kicker's lip");
  const px = W.PIPE.ax + W.PIPE.dx * 200, py = W.PIPE.ay + W.PIPE.dy * 200; assert.ok(Math.abs(W.heightAt(px, py) - W.baseH(px, py) + W.PIPE.R) < 0.05, "the pipe's floor");
  // trees: none on a groomed trail's middle
  for (const T of W.TREES) { const sf = W.surfaceAt(T.x, T.y); if (sf.trail >= 0 && W.RUNS[sf.trail].kind !== "glades") assert.ok(sf.edge < 8, `a tree in the middle of ${W.RUNS[sf.trail].id}`); }
  assert.ok(W.waterAt(W.POOL.x, W.POOL.y) === "pool", "THE RETENTION POOL is water");
  ok("world");
}

// ---- a bot ---------------------------------------------------------------------------------------------
const stickTo = (st, wx, wy, mag = 1) => { const m = Math.hypot(wx, wy) || 1; wx /= m; wy /= m; return { lx: (wx * st.cy - wy * st.cx) * mag, ly: (wx * st.cx + wy * st.cy) * mag }; };
function botRun(id, max = 60 * 240) {
  const st = S.newGame({ ch: id }), D = C.CHALLENGE[id], gates = C.gatesOf(D), fin = C.linesOf(D).finish, words = [];
  for (let t = 0; t < max && !st.ch.res; t++) {
    const g = st.ch.gi < gates.length ? gates[st.ch.gi] : fin;
    const w = S.pack({ ...stickTo(st, g.x - st.x, g.y - st.y, 0.7), tuck: true });
    words.push(w); S.step(st, w);
  }
  return { st, words };
}

// ---- determinism ------------------------------------------------------------------------------------------
{
  const { st, words } = botRun("gs");
  const res = S.resultOf(st);
  assert.ok(res && res.value != null && res.miss === 0, `the bot finishes the giant slalom clean (${JSON.stringify(res)})`);
  const rec = { v: S.VERSION, ch: "gs", board: false, inputLog: S.rleEncode(words) };
  assert.deepEqual(S.rleDecode(rec.inputLog), words, "RLE round-trips");
  assert.equal(S.logTicks(rec.inputLog), words.length);
  const a = S.replay(rec), b = S.replay(JSON.parse(JSON.stringify(rec)));
  assert.deepEqual(a.res, res, "the replay comes to the same result");
  assert.deepEqual(b.res, res, "twice");
  // a doctored log: thirty ticks of the middle steered hard left
  const bad = words.slice(); for (let i = 900; i < 930; i++) bad[i] = S.pack({ lx: -1, tuck: true });
  const c = S.replay({ ...rec, inputLog: S.rleEncode(bad) });
  assert.ok(!c.res || c.res.value !== res.value, "a doctored log does not reproduce the result");
  assert.throws(() => S.replay({ ...rec, v: S.VERSION + 1 }), /version/);
  // the snowboard is part of the record
  const d = S.replay({ ...rec, board: true });
  assert.ok(!d.res || d.res.value !== res.value, "the same log on a board is a different run");
  // a state is plain JSON (a snapshot re-plays from where it was)
  const s0 = S.newGame({ at: "compliance@b" }), w = Array.from({ length: 600 }, (_, i) => S.pack({ ly: 1, lx: i % 200 < 100 ? 0.4 : -0.4 }));
  for (const x of w.slice(0, 300)) S.step(s0, x);
  const snap = JSON.parse(JSON.stringify(s0));
  for (const x of w.slice(300)) { S.step(s0, x); S.step(snap, x); }
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), JSON.parse(JSON.stringify(s0)), "a snapshot re-plays");
  ok("determinism");
}

// ---- physics -----------------------------------------------------------------------------------------------
// a rider set down at (x, y) facing down the fall line, no input: the speed after `secs`
function fallRun(x, y, secs, word = S.IDLE) {
  const st = S.newGame({ at: "base" });
  st.x = x; st.y = y; st.z = W.heightAt(x, y);
  const [fx, fy] = W.fallAt(x, y), m = Math.hypot(fx, fy); st.hx = fx / m; st.hy = fy / m; st.cx = st.hx; st.cy = st.hy;
  for (let t = 0; t < secs * 60; t++) S.step(st, typeof word === "function" ? word(st, t) : word);
  return st;
}
{
  // two open faces: a green's gentle pitch and a black's steep one
  const gentle = W.polyAt(W.RUN.compliance, 1600), steep = W.polyAt(W.RUN["the-audit"], 600);
  const [, , sg] = W.fallAt(gentle[0], gentle[1]), [, , ss] = W.fallAt(steep[0], steep[1]);
  assert.ok(ss > sg, "the black is steeper");
  const vg = Math.hypot(fallRun(gentle[0], gentle[1], 4).vx, fallRun(gentle[0], gentle[1], 4).vy), vs = Math.hypot(fallRun(steep[0], steep[1], 4).vx, fallRun(steep[0], steep[1], 4).vy);
  assert.ok(vs > vg + 2, `steeper is faster (${vs.toFixed(1)} > ${vg.toFixed(1)} m/s)`);
  // tucked beats upright
  const tk = fallRun(steep[0], steep[1], 6, S.pack({ tuck: true })), up = fallRun(steep[0], steep[1], 6);
  assert.ok(Math.hypot(tk.vx, tk.vy) > Math.hypot(up.vx, up.vy), "a tuck is faster");
  // the same zigzag (60 degrees each side of the fall line, every 1.5 s): carved (a little stick) and skidded (full stick, brake)
  const zig = (mag, brake) => (st, t) => { const side = Math.floor(t / 90) % 2 ? 1 : -1; return S.pack({ lx: Math.sin(side * 1.05) * mag, ly: Math.cos(1.05) * mag, brake: brake && t % 90 < 30 }); };
  const carve = fallRun(steep[0], steep[1], 12, zig(0.5, false)), skid = fallRun(steep[0], steep[1], 12, zig(1, true));
  const vc = Math.hypot(carve.vx, carve.vy), vk = Math.hypot(skid.vx, skid.vy);
  assert.ok(vc > vk + 1, `carving keeps speed a skid scrubs (${vc.toFixed(1)} > ${vk.toFixed(1)} m/s)`);
  // a full stick at speed asks more than the edge holds: it slips
  const hard = fallRun(steep[0], steep[1], 6, (st, t) => S.pack({ lx: t > 240 ? 1 : 0, ly: t > 240 ? 0 : 1 }));
  assert.ok(hard.slip > 0.2 || Math.hypot(hard.vx, hard.vy) < Math.hypot(up.vx, up.vy), "a hard turn at speed skids");
  ok("physics: slope, tuck, carve vs skid");
}
// THE BIG AIR, flown by a script: tuck, hold A to the lip, let go; in the air, `air(st)` -> the word
function bigAir(air) {
  const st = S.newGame({ ch: "bigair" }), K = W.BIG_AIR, evs = [];
  let released = false;
  for (let t = 0; t < 60 * 40 && !st.ch.res; t++) {
    const dx = K.x - st.x, dy = K.y - st.y, ahead = dx * K.dx + dy * K.dy;
    const holdA = st.mode === "ski" && ahead > 0 && ahead < 40 && !released;
    if (!holdA && ahead <= 0) released = true;
    const tgt = ahead > 5 ? [dx, dy] : [K.dx, K.dy];
    const w = st.mode === "air" ? air(st) : S.pack({ ...stickTo(st, tgt[0], tgt[1], 0.6), a: holdA, tuck: true });
    S.step(st, w); evs.push(...st.ev);
  }
  return { st, evs };
}
{
  const clean = bigAir(() => S.pack({ tuck: true }));
  assert.ok(clean.st.ch.res.value > 30 && clean.st.ch.res.medal > 0, `a clean big air lands (${clean.st.ch.res.value} m)`);
  assert.ok(!clean.evs.some(e => e[0] === "crash"), "no wipeout");
  const over = bigAir(() => S.pack({ ry: 1 }));
  assert.ok(over.evs.some(e => e[0] === "crash" && /ROTATED/.test(e[1])), "flipping the whole way down: over-rotated, a wipeout");
  assert.equal(over.st.ch.res.value, null, "a crash scores nothing");
  const grab = bigAir(() => S.pack({ gl: true }));
  assert.ok(grab.evs.some(e => e[0] === "crash" && /GRABBING/.test(e[1])), "landing mid-grab: a wipeout");
  ok("physics: landings");
  // tricks: a held spin let go comes round to a whole number of half turns and scores as one
  const spin = bigAir((st) => S.pack({ rx: st.air.t < 70 ? 1 : 0 }));
  const tr = spin.evs.find(e => e[0] === "trick");
  assert.ok(tr && /^\d+$/.test(tr[1]) && Number(tr[1]) % 180 === 0 && Number(tr[1]) >= 360, `a spin lands as a spin (${tr?.[1]})`);
  const flip = bigAir((st) => S.pack({ ry: st.air.t < 40 ? 1 : 0 }));
  const tf = flip.evs.find(e => e[0] === "trick");
  assert.ok(tf && /BACKFLIP/.test(tf[1]) && tf[2] >= 500, `a pulled-back stick is a backflip (${tf?.[1]} ${tf?.[2]})`);
  const grab2 = bigAir((st) => S.pack({ gr: st.air.t > 10 && st.air.t < 70 }));
  const tg = grab2.evs.find(e => e[0] === "trick");
  assert.ok(tg && /SAFETY GRAB/.test(tg[1]) && tg[2] > 100, `a grab let go before the landing scores (${tg?.[1]})`);
  ok("tricks");
}

// ---- fast travel, finding ----------------------------------------------------------------------------------------
{
  const cfg = { board: false };
  assert.equal(S.warp(cfg, "ascent@b", ["base"]), null, "not found: no fast travel");
  assert.equal(S.warp(cfg, "ch:gs", ["base"]), null, "a challenge's flag not found: no start");
  const s = S.warp(cfg, "ascent@b", new Set(["base", "ascent@b"]));
  assert.ok(s && Math.hypot(s.x - W.POI["ascent@b"].x, s.y - W.POI["ascent@b"].y) < 1, "found: there");
  const c = S.warp(cfg, "ch:gs", ["ch:gs"]);
  assert.ok(c && c.ch?.id === "gs", "a found flag starts its challenge");
  assert.equal(S.warp(cfg, "nowhere", ["nowhere"]), null);
  // passing near a place finds it
  const st = S.newGame({ at: "base" }), P = W.POI["induction@a"];
  st.x = P.x + 10; st.y = P.y + 10;
  for (let t = 0; t < 20; t++) S.step(st, S.IDLE);
  assert.ok(st.found.includes("induction@a"), "near a lift's foot: found");
  ok("fast travel");
}

// ---- the lifts ---------------------------------------------------------------------------------------------------
{
  for (const L of W.LIFTS_W) {
    const st = S.newGame({ at: "base" });
    st.t = 1234 + L.len | 0;
    st.x = L.zone[0]; st.y = L.zone[1]; st.z = W.heightAt(st.x, st.y); st.vx = st.vy = 0;
    // the zone stands clear of every building
    assert.ok(!W.BLOCKS.some(B => L.zone[0] > B.x0 - 10 && L.zone[0] < B.x1 + 10 && L.zone[1] > B.y0 - 10 && L.zone[1] < B.y1 + 10), `${L.id}: the zone is outside`);
    // (guided) standing in the glowing zone: two seconds, then the lift takes you
    for (let i = 0; i < S.LIFT_AUTO - 1; i++) S.step(st, S.IDLE);
    assert.equal(st.mode, "ski", `${L.id}: not before two seconds`);
    S.step(st, S.IDLE);
    assert.equal(st.mode, "lift", `${L.id}: two seconds stood in the zone boards`);
    // a press of A boards at once, at any speed (here 14 m/s, across the zone's edge)
    { const s3 = S.newGame({ at: "base" }); s3.x = L.zone[0] + W.LOAD_R2 - 4; s3.y = L.zone[1]; s3.z = W.heightAt(s3.x, s3.y); s3.vx = -14; s3.vy = 0; S.step(s3, S.pack({ a: true })); assert.equal(s3.mode, "lift", `${L.id}: A boards at speed`); }
    // a snapshot from before the guidance (no g2) boards as it did: a stop in the line
    { const s4 = S.newGame({ at: "base" }); delete s4.g2; s4.x = L.load[0]; s4.y = L.load[1]; s4.z = W.heightAt(s4.x, s4.y); S.step(s4, S.IDLE); assert.equal(s4.mode, "lift", `${L.id}: the old line`); }
    assert.ok(st.lift.n <= W.liftPeriod(L), `${L.id}: the wait is at most a car's interval`);
    let waited = 0, rode = 0;
    while (st.mode === "lift" && st.lift.ph === "wait") { S.step(st, S.IDLE); waited++; }
    while (st.mode === "lift") { S.step(st, S.IDLE); rode++; }
    assert.ok(waited <= W.liftPeriod(L) + 1, `${L.id}: waited ${waited}`);
    assert.equal(rode, W.liftRideTicks(L), `${L.id}: the ride is the line's length at the lift's speed`);
    assert.ok(Math.abs(W.liftRideTicks(L) / 60 - L.len / L.speed) < 0.02);
    assert.ok(Math.hypot(st.x - L.off[0], st.y - L.off[1]) < 3, `${L.id}: put off at the top`);
    // a held A runs the ride on
    const s2 = S.newGame({ at: "base" }); s2.x = L.zone[0]; s2.y = L.zone[1]; s2.z = W.heightAt(s2.x, s2.y);
    let ff = 0; S.step(s2, S.pack({ a: true })); S.step(s2, S.IDLE); while (s2.mode === "lift" && s2.lift.ph === "wait") S.step(s2, S.IDLE);
    while (s2.mode === "lift") { S.step(s2, S.pack({ a: true })); ff++; }
    assert.ok(ff <= Math.ceil(W.liftRideTicks(L) / W.LIFT_FF) + 1, `${L.id}: a held A, ${W.LIFT_FF}x`);
  }
  // the cars come round on a loop: twice the line, a car every `spacing`
  for (const L of W.LIFTS_W) assert.equal(W.liftWait(L, W.liftPeriod(L) * 7), 0, `${L.id}: a car at every interval`);
  ok("lifts");
}

// ---- the challenges, the records ---------------------------------------------------------------------------------
{
  for (const c of C.CHALLENGES) {
    const [b, s, g] = c.medals;
    assert.ok(C.LOWER_BETTER(c) ? b >= s && s >= g : b <= s && s <= g, `${c.id}: medals in order`);
    assert.equal(C.medalOf(c, g), 3); assert.equal(C.medalOf(c, null), 0);
    if (c.start) { const st = S.newGame({ ch: c.id }); assert.equal(st.ch.ph, "count"); assert.ok(Number.isFinite(st.z)); }
    assert.ok(!/["“”]/.test(c.note || ""), `${c.id}: nobody is quoted`);
  }
  const field = C.fieldTimes();
  assert.ok(field.length >= 10 && field.every(f => f.t > 0), "the field has times");
  assert.ok(field[0].t <= field[field.length - 1].t, "the best racer on file is fastest");
  // the results shape (localStorage mocked)
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const Rc = await import("../src/play/ski/records.js");
  const p = Rc.loadProgress();
  assert.deepEqual(p.found, ["base"]);
  Rc.fileResult(p, { id: "gs", value: 50, medal: C.medalOf(C.CHALLENGE.gs, 50) });
  Rc.fileResult(p, { id: "gs", value: 60, medal: 1 });
  Rc.saveProgress(p);
  const out = Rc.skiResults();
  assert.equal(out.game, "ski");
  const gs = out.challenges.find(c => c.id === "gs");
  assert.equal(gs.best, 50, "the best is kept"); assert.ok(gs.medal >= 1); assert.match(gs.shown, /50\.00 S/);
  // the tile and the route
  const games = readFileSync(new URL("../src/play/games.js", import.meta.url), "utf8"), icons = await import("../src/play/gameIcons.js"), app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(/href: "#ski"/.test(games) && icons.ICONS.ski?.length === 12 && icons.ICONS.ski.every(r => r.length === 12), "the #play tile and its icon");
  assert.ok(app.includes('routePath === "#ski"'), "App.jsx serves #ski");
  ok("challenges, records");
}
// ---- unchanged: the challenges are version 1's, run for run ------------------------------------------------
{
  // a scripted rider down four challenges; the result, the length and a hash of every position, pinned
  // from the version-1 sim (before the free ride's guidance): a change here breaks every filed run
  const PIN = { gs: [44.88, 2873, -780530578], audit: [96.2, 5952, -1620497391], summit: [null, 18000, 70304452], instructor: [2.3, 14306, -95730174] };
  assert.equal(S.VERSION, 1, "the sim's version: challenge physics unchanged");
  for (const id of Object.keys(PIN)) for (const rookie of [false, true]) {
    const st = S.newGame({ ch: id, rookie }), D = C.CHALLENGE[id], gates = C.gatesOf(D), L = C.linesOf(D);
    let h = 0;
    for (let t = 0; t < 60 * 300 && !st.ch.res; t++) {
      const tgt = gates && st.ch.gi < gates.length ? gates[st.ch.gi] : L.finish || { x: 2160, y: -1300 };
      S.step(st, S.pack({ ...stickTo(st, tgt.x - st.x, tgt.y - st.y, 0.6), tuck: t % 200 < 120 }));
      h = (h * 31 + Math.round(st.x * 256) + Math.round(st.y * 256)) | 0;
    }
    assert.deepEqual([st.ch.res?.value ?? null, st.t, h], PIN[id], `${id}${rookie ? " (rookie)" : ""}: skis as version 1 did`);
  }
  ok("unchanged");
}

// ---- rookie -------------------------------------------------------------------------------------------------
{
  const [x, y, dx, dy] = W.polyAt(W.RUN.compliance, 900);
  const down = (rookie) => { const st = S.newGame({ at: "base", rookie }); Object.assign(st, { x, y, z: W.heightAt(x, y), hx: dx, hy: dy, vx: dx * 10, vy: dy * 10 }); let top = 0; for (let t = 0; t < 60 * 12; t++) { S.step(st, S.pack({ ...stickTo(st, ...W.polyAt(W.RUN.compliance, 900 + t * 0.4).slice(0, 2).map((v, i) => v - (i ? st.y : st.x)), 0.4), tuck: true })); if (st.run === W.RUN.compliance.i) top = Math.max(top, Math.hypot(st.vx, st.vy)); } return top; };
  const r = down(true), p = down(false);
  assert.ok(r <= S.ROOKIE.greenV + 1.5, `ROOKIE holds a green near ${S.ROOKIE.greenV} m/s (${r.toFixed(1)})`);
  assert.ok(p > r + 1, `without it the green runs faster (${p.toFixed(1)} > ${r.toFixed(1)})`);
  ok("rookie");
}

// ---- the first-timer --------------------------------------------------------------------------------------------
{
  const Gd = await import("../src/play/ski/guide.js");
  // the bot reads the screen: the arrow (a direction on the screen), the hint, the big prompt. It knows
  // no place, no lift, no challenge: it pushes the stick the way the arrow points and does what the
  // prompt says (the keyboard's words: SPACE rides, R starts).
  const read = (g) => ({ arrow: g.goal?.arrow || null, hint: Gd.fillKeys(g.hint, "keys"), big: Gd.fillKeys(g.big, "keys"), name: g.near?.id });
  const M = Gd.createGuide();
  let st = S.newGame({ at: "base", rookie: true }), t = 0, held = false;
  const when = {};
  const mark = (k) => { if (when[k] == null) when[k] = t / 60; };
  for (; t < 60 * 180; t++) {
    const scr = read(Gd.guide(M, st));
    assert.ok(scr.hint, `a hint on the screen at ${t / 60}s`);
    let w;
    if (/PRESS SPACE TO RIDE THE LIFT/.test(scr.big)) { mark("zone"); w = S.pack({ a: !held }); held = true; }
    else if (/HOLD SPACE TO SPEED UP|SPEEDING UP/.test(scr.big)) { mark("ride"); w = S.pack({ a: true }); }
    else if (/NEXT (CHAIR|CABIN)/.test(scr.big)) { mark("line"); w = S.IDLE; }
    else if (/^PRESS R TO START: /.test(scr.big)) { mark("flag"); st = S.newGame({ ch: scr.name }); break; }
    else { if (/PICK A TRAIL/.test(scr.big) || /CHOOSE A TRAIL/.test(scr.hint)) mark("top"); held = false; w = S.pack({ lx: scr.arrow[0] * 0.8, ly: scr.arrow[1] * 0.8 }); }
    S.step(st, w);
  }
  assert.ok(when.zone != null && when.zone < 20, `the base to a lift's zone in under 20 s (${when.zone})`);
  assert.ok(when.ride != null && when.ride - when.zone < 12, `boarded and riding within a car's wait (${when.ride})`);
  assert.ok(when.top != null && when.top - when.ride < 50, `at the top within the ride, held (${when.top})`);
  assert.ok(when.flag != null && when.flag - when.top < 15, `a challenge's start prompt within 15 s of the top (${when.flag})`);
  assert.ok(st.ch && st.ch.ph === "count", "the challenge starts");
  // from every place on the mountain the arrow leads somewhere: a lift's line or a flag (the pool's
  // bowl excepted: out of it is a climb), in four minutes, and on the way the hint never goes blank
  const stuck = [];
  for (const P of W.POIS) {
    if (P.id === "pool") continue;
    const M2 = Gd.createGuide(), s2 = S.newGame({ at: P.id, rookie: true });
    let done = false, pr = false;
    for (let k = 0; k < 60 * 240 && !done; k++) {
      const g = Gd.guide(M2, s2);
      if (g.phase === "flag" || g.phase === "wait" || g.phase === "lift") { done = true; break; }
      const w = g.phase === "zone" ? S.pack({ a: !pr }) : S.pack({ lx: g.goal.arrow[0] * 0.8, ly: g.goal.arrow[1] * 0.8 });
      pr = g.phase === "zone";
      S.step(s2, w);
    }
    if (!done) stuck.push(P.id);
  }
  assert.deepEqual(stuck, [], `the guidance leads somewhere from every place (stuck: ${stuck.join(", ")})`);
  ok("first-timer");
}
console.log(`check-ski: ${n} groups OK`);
