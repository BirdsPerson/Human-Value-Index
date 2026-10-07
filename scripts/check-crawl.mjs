// THE DUNGEON, stage D1 (docs/design/DUNGEON.md section 5): THE SUB-BASEMENTS B4-B8 on engine v1,
// headless. Every block is an assertion written so it can fail.
//   purity        every file under engine*/: no clock, no Math.random, no trig / hypot / pow / exp / log,
//                 no **, no DOM, no new Date / Date( / Intl / toLocale, no .sort( without a tie-break;
//                 no import leaves its engine directory
//   theme         the Sub-Basements pack passes the theme contract
//   route         10,000 seeds: the descent reachable from the arrival, the shortest route (after
//                 loops) inside the band's range, chain retries under 1 % of seeds, generation <= 5 ms
//   connectivity  every keycard reachable with its store shut; the store never on the shortest route;
//                 every cabinet leaves every room reachable
//   grace         no monster in sight of an arrival door at frame 0, none within 6 tiles of it; turrets
//                 never face a wall within 3 tiles; generators never in the arrival or descent room
//   determinism   the v1 fixtures replay; a doctored log does not; another version is refused; a JSON
//                 snapshot at a frame that is not a multiple of 10 re-plays identically (per-frame hash);
//                 a cfg that differs in day or cleared plays a different floor
//   combat        roll i-frames exactly 12 of 18; a hit in them deals 0; knockback never into a wall;
//                 hit-stop is in the fixtures (an engine without it does not reproduce them)
//   ai            no entity but the Auditor inside a wall; no doorway oscillation > 60 frames; swarms
//                 never more than 2 on a tile; a chaser reaches a standing player from 14 tiles within 4 s
//   auditor       arrives on the loiter tick exactly; crosses a wall; 1.4 x walk by 2:00; a seat that
//                 circles for 17 minutes after he arrives ends lost and files no pack
//   loss          after exit "lost" (hearts or shift) the claim's pack and bounty are empty and lifts
//                 reached stay; the dropped pack is the owner's seat's only
//   softlock      an infested floor unseals when every countable monster is filed (generator spawns and
//                 the Auditor excluded); a full pack never blocks a keycard
//   seats         a two-seat run steps and replays from logs[] (the co-op-ready shape); cfg carries the
//                 permit's keys; the permit seam is local in D1
//   cost          <= 20 us a frame with one seat and 40 entities, <= 50 us with four seats; a 72,000-frame
//                 solo run <= 1.5 s of engine time
//   calibration   the first-timer bot (scripts/crawlBot.mjs), N = 400 a level: INTERN 70-80 % reach the
//                 B8 lift, monotone across the levels
//   doors         the games tile, the route, the Pen's service lift and the building view's line; the
//                 page is a lazy chunk
// Run: node scripts/check-crawl.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, cpSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const S = await import("../src/play/crawl/engine/index.js");
const Bot = await import("./crawlBot.mjs");
const N_CAL = 400;
const cfgOf = (seed, level = "intern", extra = {}) => ({ runId: `chk-${seed}`, theme: "subbasements", level, entry: 4, day: 20000, cleared: 0, seats: [null], seed, at: 0, v: S.VERSION, hand: 1, controls: "assist", ...extra });

// ---- calibration workers (started first, read at the end) ----------------------------------------
function measure(level, n) {
  const out = { level, n, lift: 0, hearts: 0, shift: 0 };
  for (let k = 0; k < n; k++) { const { st } = Bot.botRunSync(S, cfgOf(1000 + k * 7919, level)); if (st.exit === "lift") out.lift++; else out[st.why]++; }
  return out;
}
if (!isMainThread) { parentPort.postMessage(measure(workerData.level, workerData.n)); process.exit(0); }
const CAL = S.LEVEL_ORDER.map(level => new Promise((res, rej) => { const w = new Worker(new URL(import.meta.url), { workerData: { level, n: N_CAL } }); w.once("message", res); w.once("error", rej); }));

let n = 0;
const ok = (msg) => { n++; if (process.env.VERBOSE) console.log("ok", msg); };
const TH = S.THEMES.subbasements;
const here = fileURLToPath(new URL("../src/play/crawl/", import.meta.url));

// ---- purity ----------------------------------------------------------------------------------------
{
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".js") ? [join(d, e.name)] : []));
  const roots = readdirSync(here).filter(x => /^engine(-v\d+)?$/.test(x)).map(x => join(here, x));
  assert.ok(roots.length >= 1, "the engine directory is there");
  let files = 0;
  for (const root of roots) for (const f of walk(root)) {
    files++;
    const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, ""), name = relative(here, f);
    for (const bad of ["Math.random", "Date.now", "performance", "Math.sin", "Math.cos", "Math.tan", "Math.atan", "Math.hypot", "Math.pow", "Math.exp", "Math.log", "**", "document", "window", "import(", "new Date", "Date(", "Intl", "toLocale", "Float32Array", "Float64Array", "Int32Array", "Uint8Array"]) assert.ok(!src.includes(bad), `${name} uses ${bad}`);
    for (const m of src.matchAll(/\.sort\(([^)]*)\)/g)) assert.ok(m[1].includes("||"), `${name}: a .sort( without a tie-break`);
    for (const m of src.matchAll(/\bfrom\s+"([^"]+)"/g)) {
      assert.ok(m[1].startsWith("."), `${name} imports a package (${m[1]})`);
      assert.ok(resolve(dirname(f), m[1]).startsWith(root + sep), `${name} imports from outside its engine directory (${m[1]})`);
    }
  }
  assert.ok(files >= 20, "the engine is split into modules");
  ok("purity");
}

// ---- the theme ---------------------------------------------------------------------------------------
{
  assert.deepEqual(S.validateTheme(TH), [], "the Sub-Basements pass the theme contract");
  assert.ok(S.isLiftFloor(TH, 8) && !S.isLiftFloor(TH, 4) && !S.isLiftFloor(TH, 7) && S.isLiftFloor(TH, 12), "lifts at B8 and every four floors after");
  const b = TH.bands[0];
  assert.deepEqual([b.size, b.rooms, b.path, b.infested], [[40, 28], [8, 11], [5, 7], 0.08], "band 1 is STORAGE as the design has it");
  for (const m of ["feral-data", "form-27b", "file-cart", "toner-printer"]) assert.ok(b.roster.includes(m), `${m} on the band 1 roster`);
  assert.equal(TH.monsters.copier.every, 360, "THE COPIER every 6 s"); assert.equal(TH.monsters.copier.hp, 6);
  assert.equal(TH.monsters["form-27b"].group, 6, "FORM 27-B comes six at a time");
  assert.equal(TH.monsters["feral-data"].size, 3, "FERAL DATA splits 3 -> 2 -> 1");
  ok("theme");
}

// ---- route, connectivity, grace: 10,000 seeds ----------------------------------------------------------
{
  const { T, bfs, passable, los } = S;
  let retries = 0, worst = 0, seeds = 0, stores = 0, copiers = 0, infested = 0;
  const t0 = performance.now();
  for (let s = 0; s < 10000; s++) {
    const f = 4 + (s % 5), fl = S.generateFloor(TH, f, (s * 2654435761) >>> 0);
    seeds++; retries += fl.retries ? 1 : 0;
    const g = fl.g;
    // route
    const d = bfs(g, fl.arrival.i);
    assert.ok(d[fl.descent.i] > 0, `seed ${s}: the descent is reachable`);
    assert.ok(fl.routeLen >= fl.band.path[0] && fl.routeLen <= fl.band.path[1], `seed ${s}: route ${fl.routeLen} rooms outside ${fl.band.path}`);
    assert.equal(g.t[fl.descent.i], fl.lift ? T.LIFT : T.STAIRS, `seed ${s}: the descent tile`);
    // connectivity: the store is a leaf off the route; its keycard reachable with it shut
    if (fl.store >= 0) {
      stores++;
      assert.ok(!fl.route.includes(fl.store), `seed ${s}: the locked store on the route`);
      assert.equal(g.t[fl.storeDoor], T.LOCKED);
      const k = Math.floor(fl.keycard.y) * g.w + Math.floor(fl.keycard.x);
      assert.ok(d[k] >= 0, `seed ${s}: the keycard needs its own door`);
      assert.notEqual(g.room[k], fl.store, `seed ${s}: the keycard in its own store`);
    }
    // every room cell reachable with locked doors open and cabinets solid (no cabinet cuts a room)
    const all = bfs(g, fl.arrival.i, (t) => t !== T.WALL && t !== T.CAB);
    for (let i = 0; i < g.t.length; i++) if (g.room[i] >= 0 && g.t[i] !== T.CAB) assert.ok(all[i] >= 0, `seed ${s}: tile ${i} cut off`);
    // grace: nothing in sight of an arrival door, nothing within 6 tiles of one
    const ad = fl.doors.filter(D => D.a === fl.arrivalRoom || D.b === fl.arrivalRoom).map(D => [(D.i % g.w) + 0.5, Math.floor(D.i / g.w) + 0.5]);
    for (const m of fl.spawns) {
      assert.notEqual(g.room[Math.floor(m.y) * g.w + Math.floor(m.x)], fl.arrivalRoom, `seed ${s}: a spawn in the arrival room`);
      for (const [x, y] of ad) { assert.ok((m.x - x) * (m.x - x) + (m.y - y) * (m.y - y) >= 36, `seed ${s}: a spawn within 6 tiles of the arrival door`); assert.ok(!los(g, m.x, m.y, x, y), `seed ${s}: a spawn in sight of the arrival door`); }
      if (m.k === "toner-printer") for (let q = 1; q <= 3; q++) assert.ok(passable(g.t[Math.floor(m.y + m.fy * q) * g.w + Math.floor(m.x + m.fx * q)]), `seed ${s}: a printer facing a wall`);
      if (m.k === "copier") { copiers++; const r = g.room[Math.floor(m.y) * g.w + Math.floor(m.x)]; assert.ok(r !== fl.arrivalRoom && r !== fl.descentRoom, `seed ${s}: a generator in the arrival or descent room`); }
    }
    if (fl.infested) infested++;
    worst = Math.max(worst, fl.retries);
  }
  const ms = (performance.now() - t0) / seeds;
  assert.ok(retries / seeds < 0.01, `chain retries on ${(100 * retries / seeds).toFixed(2)} % of seeds`);
  assert.ok(ms <= 5, `generation ${ms.toFixed(2)} ms a floor (<= 5)`);
  assert.ok(stores > 1500 && copiers > 1500 && infested > 200, `the machines appear (${stores} stores, ${copiers} copiers, ${infested} infested)`);
  ok(`route: 10,000 seeds, ${ms.toFixed(2)} ms a floor, ${retries} retried`);
}

// ---- determinism -------------------------------------------------------------------------------------
const FIX = new URL("./fixtures/crawl-v1-records.json", import.meta.url);
assert.ok(existsSync(FIX), "the v1 fixtures exist (scripts/freeze-crawl.mjs)");
const FIXTURES = JSON.parse(readFileSync(FIX, "utf8")).records;
{
  const R = await import("../src/play/crawl/replay.js");
  assert.ok(FIXTURES.length >= 8, "a tape for every level and more");
  for (const rec of FIXTURES) {
    assert.deepEqual(R.replayRecord(rec), rec.claim, `fixture ${rec.cfg.runId} replays (frozen v1)`);
    if (rec.v === S.VERSION) assert.deepEqual(S.replay(rec), rec.claim, `fixture ${rec.cfg.runId} replays (live)`);
  }
  for (const lv of S.LEVEL_ORDER) assert.ok(FIXTURES.some(r => r.cfg.level === lv), `a ${lv} tape`);
  assert.ok(FIXTURES.some(r => r.claim.exit === "lift") && FIXTURES.some(r => r.claim.exit === "lost"), "tapes of both endings");
  assert.ok(FIXTURES.some(r => r.logs.length === 2), "a two-seat tape");
  // a doctored log does not reproduce; another version is refused
  const rec = FIXTURES.find(r => r.claim.exit === "lift" && r.logs.length === 1);
  const bad = JSON.parse(JSON.stringify(rec)); const w = S.rleDecode(bad.logs[0]); for (let i = 200; i < 260; i++) w[i] = S.pack({ head: 4, mag: 2, roll: i % 2 === 0 }); bad.logs[0] = S.rleEncode(w);
  assert.notDeepEqual(S.replay(bad), rec.claim, "a doctored log does not reproduce the claim");
  assert.throws(() => S.replay({ ...rec, v: 99 }), /not engine/, "another version is refused");
  assert.ok(S.validLog(rec.logs[0]) && !S.validLog([1, 0]) && !S.validLog([1 << 23, 1]) && !S.validLog([1, 2, 3]), "validLog");
  // a snapshot at frame 1237 (not a multiple of 10), through JSON, re-plays to the same end and hash
  const words = S.rleDecode(rec.logs[0]), a = S.newRun(rec.cfg);
  for (let f = 0; f < 1237; f++) S.step(a, [words[f]]);
  const b = JSON.parse(JSON.stringify(a)), hashes = [];
  for (let f = 1237; f < words.length && a.phase !== "filed"; f++) { S.step(a, [words[f]]); hashes.push(a.hash); }
  for (let f = 1237, k = 0; f < words.length && b.phase !== "filed"; f++, k++) { S.step(b, [words[f]]); assert.equal(b.hash, hashes[k], `the snapshot diverges at frame ${f}`); }
  assert.deepEqual(S.claimOf(b), S.claimOf(a), "a JSON snapshot re-plays identically");
  // everything the sim reads is in cfg: day and cleared change the floor
  const f0 = S.newRun(cfgOf(77)), f1 = S.newRun(cfgOf(77, "intern", { day: 20001 })), f2 = S.newRun(cfgOf(77, "intern", { cleared: 3 }));
  assert.notDeepEqual(f0.fl.g.t, f1.fl.g.t, "cfg.day changes the floor"); assert.notDeepEqual(f0.fl.g.t, f2.fl.g.t, "cfg.cleared changes the floor");
  assert.deepEqual(S.newRun(cfgOf(77)).fl.g.t, f0.fl.g.t, "the same cfg, the same floor");
  ok("determinism");
}

// ---- combat feel numbers -------------------------------------------------------------------------------
const W = (o) => S.pack(o);
{
  const st = S.newRun(cfgOf(5, "clerk")), P = st.ents.find(e => e.k === "player");
  for (let f = 0; f < 70; f++) S.step(st, [0]);
  S.step(st, [W({ head: 0, mag: 2, roll: true })]);
  let inv = 0, frames = 1; if (S.iframe(P)) inv++;
  while (P.roll > 0) { S.step(st, [W({ head: 0, mag: 2 })]); frames++; if (P.roll > 0 && S.iframe(P)) inv++; }
  assert.equal(frames, S.ROLL_F, "a roll is 18 frames");
  // count exactly over the 18 frames of a roll from its first frame
  let k = 0; for (let r = S.ROLL_F; r > 0; r--) { if (S.ROLL_F - r >= S.ROLL_I0 && S.ROLL_F - r < S.ROLL_I1) k++; } assert.equal(k, 12, "12 i-frames of 18");
  const C = await import("../src/play/crawl/engine/combat.js");
  P.roll = S.ROLL_F - 5; P.hurt = 0; const hp = P.hp; assert.equal(C.hurt(st, P, 8, P.x + 1, P.y), 0, "a hit in the i-frames deals 0"); assert.equal(P.hp, hp);
  P.roll = 0; assert.ok(C.hurt(st, P, 4, P.x + 1, P.y) > 0, "a hit outside them lands");
  // knockback never into a wall: push monsters at every wall in reach
  const G = await import("../src/play/crawl/engine/grid.js"), E = await import("../src/play/crawl/engine/entities.js");
  for (let s = 0; s < 200; s++) {
    const t = S.newRun(cfgOf(300 + s)), g = t.fl.g, i = (s * 97) % g.t.length; if (g.t[i] !== S.T.FLOOR) continue;
    const m = E.newMon(t, TH, "feral-data", (i % g.w) + 0.5, Math.floor(i / g.w) + 0.5);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071]]) { C.knock(g, m, dx, dy, 1); assert.ok(!G.boxHits(g, m.x, m.y, m.r), `seed ${300 + s}: knockback into a wall`); }
  }
  // hit-stop is in the fixtures: the same engine with HITSTOP = 0 does not reproduce them
  const tmp = mkdtempSync(join(tmpdir(), "crawl-nohs-")); cpSync(join(here, "engine"), tmp, { recursive: true });
  const cf = join(tmp, "combat.js"); writeFileSync(cf, readFileSync(cf, "utf8").replace(/HITSTOP = 3/, "HITSTOP = 0"));
  const NH = await import(pathToFileURL(join(tmp, "index.js")).href);
  assert.equal(NH.HITSTOP, 0);
  const hs = FIXTURES.filter(r => r.logs.length === 1 && !r.cfg.runId.endsWith("circle")).map(r => JSON.stringify(NH.replay(r)) !== JSON.stringify(r.claim) || NH.replayState(r).frame !== S.replayState(r).frame);
  assert.ok(hs.every(Boolean), "removing hit-stop changes every fixture that lands a hit");
  ok("combat");
}

// ---- AI sanity (over bot runs at every level) --------------------------------------------------------
{
  const G = await import("../src/play/crawl/engine/grid.js");
  let frames = 0, maxStack = 0;
  const osc = new Map();
  for (let k = 0; k < 24; k++) {
    const st = S.newRun(cfgOf(5000 + k * 131, S.LEVEL_ORDER[k % 4])), bot = Bot.firstTimer(5000 + k * 131);
    for (let f = 0; f < 30000 && st.phase !== "filed"; f++) {
      S.step(st, [bot(st)]); frames++;
      if (st.phase !== "floor") continue;
      const g = st.fl.g, tiles = new Map();
      for (const e of st.ents) {
        if (e.k !== "mon" || e.dead) continue;
        if (e.a !== "stalker") assert.ok(!G.boxHits(g, e.x, e.y, Math.min(e.r, 0.2)), `run ${k} frame ${st.frame}: ${e.m} inside a wall`);
        if (e.a === "swarm") { const i = Math.floor(e.y) * g.w + Math.floor(e.x); tiles.set(i, (tiles.get(i) || 0) + 1); }
        // doorway oscillation: on or beside a door tile, reversing direction every few frames, not progressing
        const i = Math.floor(e.y) * g.w + Math.floor(e.x), atDoor = g.t[i] === S.T.DOOR || [i - 1, i + 1, i - g.w, i + g.w].some(j => g.t[j] === S.T.DOOR);
        const o = osc.get(e.id) || { n: 0, x: e.x, y: e.y, fx: e.fx, fy: e.fy, floor: st.floor };
        const flip = o.fx * e.fx + o.fy * e.fy < -0.5;
        if (atDoor && e.s === "chase" && flip && Math.abs(e.x - o.x) + Math.abs(e.y - o.y) < 1.5) o.n++; else if (!atDoor || e.s !== "chase") { o.n = 0; o.x = e.x; o.y = e.y; }
        o.fx = e.fx; o.fy = e.fy; osc.set(e.id, o);
        assert.ok(o.n <= 60, `run ${k}: ${e.m} oscillates in a doorway`);
      }
      for (const c of tiles.values()) maxStack = Math.max(maxStack, c);
    }
  }
  assert.ok(maxStack <= 2, `swarms stacked ${maxStack} on a tile`);
  // a chaser reaches a standing player from 14 tiles within 4 s (an open floor, in sight)
  const AR = await import("../src/play/crawl/engine/ai/archetypes.js"), E = await import("../src/play/crawl/engine/entities.js");
  for (const m of ["file-cart", "form-27b"]) {
    const st = S.newRun(cfgOf(9)); const g = st.fl.g;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const i = y * g.w + x; g.t[i] = x && y && x < g.w - 1 && y < g.h - 1 ? S.T.FLOOR : S.T.WALL; g.room[i] = g.t[i] === S.T.FLOOR ? 0 : -1; }
    st.rev = [1]; st.ents = st.ents.filter(e => e.k === "player"); st.phase = "floor";
    const P = st.ents[0]; P.x = 5.5; P.y = 14.5; P.hp = 999; P.hpMax = 999;
    const e = E.newMon(st, TH, m, 19.5, 14.5); e.s = "chase"; e.seen = 0; st.flowDirty = true;
    let t = 0; for (; t < 240; t++) { S.step(st, [0]); if (Math.abs(e.x - P.x) + Math.abs(e.y - P.y) < 1.2 || P.hp < 999) break; }
    assert.ok(t < 240, `${m} reached a standing player from 14 tiles in ${t} frames`);
    assert.ok(AR.stalkFactor(0) === 0.8, "the Auditor starts at 0.8 x walk");
  }
  ok(`ai: ${frames} frames`);
}

// ---- THE AUDITOR -------------------------------------------------------------------------------------
{
  // arrives on the tick, through a wall, accelerating to 1.4 x walk by 2:00
  const st = S.newRun(cfgOf(21, "clerk")), L = S.LEVELS.clerk.loiter * 60;
  let arrived = -1, inWall = false, A = null, speedAt120 = 0;
  for (let f = 0; f < L + 7300 && st.phase !== "filed"; f++) {
    const P = st.ents.find(e => e.k === "player"); P.hp = P.hpMax; P.hurt = 1;   // standing still, never hurt: watch him come
    S.step(st, [0]);
    if (st.ev.some(e => e.t === "stalker.arrive")) { arrived = st.loiter; A = st.ents.find(e => e.a === "stalker"); }
    if (A) { const g = st.fl.g; if (g.t[Math.floor(A.y) * g.w + Math.floor(A.x)] === S.T.WALL) inWall = true; }
    if (A && A.age === 7200) speedAt120 = S.stalkFactor(A.age);
  }
  assert.equal(arrived, L, "the Auditor arrives on the loiter tick exactly");
  assert.ok(inWall, "he comes through a wall");
  assert.ok(Math.abs(speedAt120 - 1.4) < 1e-9 && S.stalkFactor(7199) < 1.4 && S.stalkFactor(600) === 0.8 * 1.05, "1.4 x walk by 2:00, +5 % every 10 s");
  // a seat that circles its room for 17 minutes after he arrives: lost, nothing filed
  for (const lv of S.LEVEL_ORDER) {
    const c = S.newRun(cfgOf(31, lv)), seat = c.seats[0];
    seat.pack[0] = { k: "coffee" }; seat.pack[1] = { k: "crate", id: "4-99" }; seat.bounty = 50;
    let f = 0;
    const P = c.ents.find(e => e.k === "player"), cx = P.x, cy = P.y;
    for (; f < S.LEVELS[lv].loiter * 60 + 17 * 3600 && c.phase !== "filed"; f++) {
      const ang = Math.floor(f / 20) % 16, dx = cx - P.x, dy = cy - P.y, back = dx * dx + dy * dy > 4;
      S.step(c, [W({ head: back ? S.headingOf(dx, dy) : ang, mag: 2, roll: f % 50 === 0 })]);
    }
    assert.equal(c.exit, "lost", `${lv}: the circling seat is caught`);
    assert.deepEqual(S.claimOf(c).pack, [], `${lv}: it files no pack`); assert.equal(S.claimOf(c).bounty, 0);
  }
  ok("auditor");
}

// ---- the loss rule, the lift rule ---------------------------------------------------------------------
{
  // hearts: the pack left where you fell, the owner's only; lifts reached stay
  const st = S.newRun(cfgOf(41, "clerk", { seats: ["casehash-a"] }));
  st.seats[0].pack[0] = { k: "coffee" }; st.lifts.push(8);
  const P = st.ents.find(e => e.k === "player"); P.hp = 0;
  for (let f = 0; f < 200 && st.phase !== "filed"; f++) S.step(st, [0]);
  const c = S.claimOf(st);
  assert.equal(c.exit, "lost"); assert.equal(c.why, "hearts"); assert.deepEqual(c.pack, []); assert.equal(c.bounty, 0); assert.deepEqual(c.lifts, [8], "a lift reached stays reached");
  assert.deepEqual(st.drops, [{ seat: 0, owner: "casehash-a", f: 4, x: P.x, y: P.y, items: ["coffee"] }], "the pack is left where you fell, for its owner");
  // the shift: the cleaners take it (no drop)
  const sh = S.newRun(cfgOf(42, "intern")); sh.seats[0].pack[0] = { k: "form00" }; sh.shift = S.SHIFT - 2;
  for (let f = 0; f < 200 && sh.phase !== "filed"; f++) S.step(sh, [0]);
  assert.equal(sh.exit, "lost"); assert.equal(sh.why, "shift"); assert.deepEqual(S.claimOf(sh).pack, []); assert.equal(sh.drops.length, 0, "the night cleaners take it");
  // a lift run keeps the pack, and the lift reached is on the claim
  const lifted = FIXTURES.find(r => r.claim.exit === "lift");
  assert.ok(lifted.claim.lifts.includes(8) && lifted.claim.depth === 8, "the B8 lift is reached and filed");
  const sw = S.SHIFT_WARN; assert.deepEqual(sw, [64800, 68400], "warnings at 18:00 and 19:00");
  ok("loss");
}

// ---- softlocks -----------------------------------------------------------------------------------------
{
  // an infested floor unseals when every countable monster is filed; spawns and the Auditor do not count
  let tested = 0;
  for (let s = 0; s < 4000 && tested < 12; s++) {
    const st = S.newRun(cfgOf(s, "clerk", { entry: 5 }));
    if (!st.fl.infested) continue;
    tested++;
    assert.ok(st.sealed, "an infested floor starts sealed");
    st.phase = "floor";
    const AR = await import("../src/play/crawl/engine/ai/archetypes.js"); void AR;
    const E = await import("../src/play/crawl/engine/entities.js");
    const gen = st.ents.find(e => e.a === "generator");
    if (gen) { const sp = E.newMon(st, TH, "form-27b", gen.x, gen.y, { bound: gen.id }); assert.equal(sp.cnt, false, "a generator's spawn does not count"); }
    for (const e of st.ents) if (e.k === "mon" && e.cnt) { e.dead = true; }
    // splitter children: kill a size-3 properly and confirm its family is finite
    S.step(st, [0]);
    assert.equal(st.sealed, false, "every countable monster filed unseals it");
  }
  assert.ok(tested >= 5, "infested floors exist to test");
  // a splitter's family is finite: 1 + 2 + 4
  const C = await import("../src/play/crawl/engine/combat.js"), E = await import("../src/play/crawl/engine/entities.js");
  const st = S.newRun(cfgOf(3)); st.ents = st.ents.filter(e => e.k === "player");
  const m = E.newMon(st, TH, "feral-data", st.fl.arrival.x, st.fl.arrival.y);
  let bodies = 0;
  for (let k = 0; k < 50; k++) { const live = st.ents.filter(e => e.k === "mon" && !e.dead); if (!live.length) break; for (const e of live) { C.hitThing(st, TH, e, 99, 0, 0, 0); bodies++; } }
  assert.equal(bodies, 7, "FERAL DATA: 3 -> two 2s -> four 1s"); void m;
  // a full pack never blocks a keycard
  for (let s = 0; s < 400; s++) {
    const t = S.newRun(cfgOf(s, "clerk")); if (!t.fl.keycard) continue;
    for (let i = 0; i < 12; i++) t.seats[0].pack[i] = { k: "coffee" };
    const P = t.ents.find(e => e.k === "player"); P.x = t.fl.keycard.x; P.y = t.fl.keycard.y;
    S.step(t, [0]);
    assert.equal(t.seats[0].keycard, t.floor, "the keycard is taken with a full pack"); break;
  }
  ok("softlock");
}

// ---- seats and the record's shape ---------------------------------------------------------------------
{
  const two = FIXTURES.find(r => r.logs.length === 2);
  assert.equal(two.cfg.seats.length, 2);
  const st = S.newRun(two.cfg);
  assert.equal(st.seats.length, 2); assert.equal(st.ents.filter(e => e.k === "player").length, 2, "a player per seat");
  for (const rec of FIXTURES) assert.deepEqual(Object.keys(rec.cfg).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0) || 0), [...S.CFG_KEYS].sort(), "cfg carries the permit's keys");
  const api = readFileSync(new URL("../src/play/crawl/api.js", import.meta.url), "utf8");
  assert.ok(/SERVER_FILING = false/.test(api) && !/fetch\(/.test(api), "D1's permit is the local seam: nothing is filed, no ledger is called");
  ok("seats");
}

// ---- engine cost --------------------------------------------------------------------------------------
{
  const E = await import("../src/play/crawl/engine/entities.js");
  const busy = (seats) => {
    const st = S.newRun(cfgOf(61, "clerk", { seats: new Array(seats).fill(null) }));
    st.phase = "floor";
    const g = st.fl.g, cells = []; for (let i = 0; i < g.t.length; i++) if (g.t[i] === S.T.FLOOR) cells.push(i);
    const kinds = ["form-27b", "feral-data", "file-cart", "toner-printer"];
    while (st.ents.length < 40 + seats) { const i = cells[(st.ents.length * 37) % cells.length]; E.newMon(st, TH, kinds[st.ents.length % 4], (i % g.w) + 0.5, Math.floor(i / g.w) + 0.5); }
    st.rev = st.rev.map(() => 1);
    for (const P of st.ents) if (P.k === "player") { P.hp = 1e6; P.hpMax = 1e6; }
    const words = new Array(seats).fill(0);
    for (let f = 0; f < 300; f++) S.step(st, words.map((_, k) => W({ head: (f >> 4) % 16, mag: 2, attack: (f + k) % 9 === 0 })));
    const t0 = performance.now(); let n = 0;
    for (let f = 0; f < 3000; f++) { S.step(st, words.map((_, k) => W({ head: (f >> 4) % 16, mag: 2, attack: (f + k) % 9 === 0 }))); n++; }
    return ((performance.now() - t0) * 1000) / n;
  };
  const one = busy(1), four = busy(4);
  assert.ok(one <= 20, `${one.toFixed(1)} us a frame with one seat and 40 entities (<= 20)`);
  assert.ok(four <= 50, `${four.toFixed(1)} us a frame with four seats (<= 50)`);
  // a 72,000-frame solo run: engine time only
  const st = S.newRun(cfgOf(62, "intern")), bot = Bot.firstTimer(62); let eng = 0, f = 0;
  for (; f < 72000 && st.phase !== "filed"; f++) { const w = bot(st); const t0 = performance.now(); S.step(st, [w]); eng += performance.now() - t0; if (st.phase === "filed") { const s2 = S.newRun(cfgOf(62 + f, "intern")); Object.assign(st, s2); } }
  assert.ok(eng <= 1500, `a 72,000-frame solo run took ${eng.toFixed(0)} ms of engine time (<= 1500)`);
  ok(`cost: ${one.toFixed(1)} / ${four.toFixed(1)} us a frame, ${eng.toFixed(0)} ms a shift`);
}

// ---- the doors ------------------------------------------------------------------------------------------
{
  const games = readFileSync(new URL("../src/play/games.js", import.meta.url), "utf8"), app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { GAMES, routesIn } = await import("../src/play/games.js");
  assert.ok(GAMES.some(g => g.href === "#basements" && g.icon === "basement"), "THE GAMES has the Sub-Basements tile"); void games;
  assert.ok(routesIn(app).includes("#basements"), "App.jsx serves #basements");
  assert.ok(/const Crawl = lazy\(\(\) => import\("\.\/play\/crawl\/Crawl\.jsx"\)\)/.test(app) && !/from "\.\/play\/crawl\//.test(app), "the page is a lazy chunk");
  const { ICONS } = await import("../src/play/gameIcons.js"); assert.ok(ICONS.basement?.length === 12 && ICONS.basement.every(r => r.length === 12), "the tile's icon is 12 x 12");
  const pen = readFileSync(new URL("../src/Pen.jsx", import.meta.url), "utf8"), bv = readFileSync(new URL("../src/city/BuildingView.jsx", import.meta.url), "utf8");
  assert.ok(pen.includes('href="#basements"') && pen.includes("SERVICE LIFT: B4 AND BELOW"), "the Pen's B3 strip has the service lift");
  assert.ok(bv.includes('href="#basements"'), "the HQ building view names the way down");
  if (existsSync(new URL("../dist/index.html", import.meta.url))) { const a = readdirSync(new URL("../dist/assets/", import.meta.url)); assert.ok(a.some(f => /^Crawl-.*\.js$/.test(f)), "the build has a Crawl chunk"); }
  ok("doors");
}

// ---- calibration -----------------------------------------------------------------------------------------
{
  const res = await Promise.all(CAL), pct = Object.fromEntries(res.map(r => [r.level, (100 * r.lift) / r.n]));
  const line = res.map(r => `${r.level} ${pct[r.level].toFixed(1)} %`).join(", ");
  assert.ok(pct.intern >= 70 && pct.intern <= 80, `INTERN reaches the B8 lift ${pct.intern.toFixed(1)} % (70-80): ${line}`);
  for (let i = 1; i < S.LEVEL_ORDER.length; i++) assert.ok(pct[S.LEVEL_ORDER[i]] < pct[S.LEVEL_ORDER[i - 1]], `monotone: ${line}`);
  ok(`calibration (N = ${N_CAL}): ${line}`);
  if (process.env.VERBOSE || process.argv.includes("--cal")) console.log("calibration", line, JSON.stringify(res));
}

console.log(`check-crawl: ${n} blocks OK`);
