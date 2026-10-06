// THE HUNT, a light-gun trip: a pure, fixed-step (60 Hz) state machine, like the waters (fish/sim.js).
// No DOM, no clock, no Math.random, no transcendental Math: newHunt(cfg) and the same per-tick input
// give the same trip, tick for tick, in any engine. A trip is {cfg, log}; the cabinet's endpoint
// (netlify/functions/hunt.js) re-plays it before a score goes on the board.
//
// cfg: {v, seed, trip (data.js TRIPS id), at (real ms the trip began: the light), player: {name}}.
// Input, each tick: the reticle (x, y in game px, quantized; x = -1 when the pointer is off the
// screen) and the buttons (FIRE, RELOAD). A shot is FIRE's rising edge. Shooting off the screen
// reloads, like a light gun pointed at the floor.
//
// A trip: a few stages on a slow rail (the view pans across the scene), the target species
// crossing, pausing, bolting at a shot; the females you must not shoot (a strike each: three and the
// licence is revoked); critters for a bonus; a bonus round of birds (or the Department's forms).
// A hunting stage needs a male filed (RULES.QUOTA) to go on. At the end: the accuracy bonus and the
// trophy (the best male, scored in tenths of an inch on the Department's own scale).

import { W, H, SPECIES_BY, SCENES, TRIP, RULES, LINES, conditionsAt, fnv, rngStep, HZ } from "./data.js";

export const VERSION = 1;
export { HZ, W, H };
export const BTN = { FIRE: 1, RELOAD: 2 };
export const OFF = -1;   // the reticle off the screen

// a trip's whole length can never exceed this (every stage, its card and its tally)
export const tripTicks = (trip) => (TRIP[trip]?.scenes.length || 0) * (RULES.TITLE_TICKS + RULES.STAGE_TICKS + RULES.CLEAR_TICKS) + 10;

export const sceneOf = (st) => SCENES[TRIP[st.cfg.trip].scenes[st.si]];
export const stageLen = (scene) => (scene.bonus ? RULES.BONUS_TICKS : RULES.STAGE_TICKS);
export const scaleOf = (d) => 0.55 + 0.95 * d;
export const groundY = (scene, d) => scene.horizon + 6 + d * (H - 14 - scene.horizon);
const CRITTERS = { rabbit: { w: 10, h: 8, speed: 0.9 }, turkey: { w: 12, h: 13, speed: 0.4 } };

// ---- a new trip -------------------------------------------------------------------------------------
export function newHunt(cfg) {
  const seed = (cfg.seed >>> 0) || 1;
  const trip = TRIP[cfg.trip] ? cfg.trip : "whitetail";
  const at = Number.isFinite(cfg.at) ? Math.floor(cfg.at) : 0;
  const st = {
    v: VERSION, cfg: { v: VERSION, seed, trip, at, player: cfg.player || null },
    rng: fnv(`hunt|${seed}|${trip}|${at}`), tick: 0, si: 0, phase: "title", pt: 0, cam: 0,
    ammo: RULES.SHELLS, reload: 0, cool: 0, prevB: 0, px: W / 2, py: H / 2,
    targets: [], sched: [], nextId: 1, score: 0, shots: 0, hits: 0, strikes: 0,
    stage: null, stages: [], kills: [], end: null, trophy: null, bonus: 0,
    light: conditionsAt(at).light, msg: "", msgAt: 0, ev: [], fx: [],
  };
  beginStage(st);
  return st;
}
function rand(st) { const [v, n] = rngStep(st.rng); st.rng = n; return v; }
const ri = (st, n) => Math.floor(rand(st) * n);
const say = (st, m) => { st.msg = m; st.msgAt = st.tick; };

function beginStage(st) {
  const scene = sceneOf(st), trip = TRIP[st.cfg.trip];
  st.phase = "title"; st.pt = 0; st.cam = 0; st.targets = []; st.fx = [];
  st.stage = { scene: TRIP[st.cfg.trip].scenes[st.si], males: 0, females: 0, critters: 0, birds: 0, points: 0 };
  st.sched = schedule(st, scene, trip);
  st.ev.push(scene.bonus ? "bonus" : "stage");
  say(st, scene.bonus ? (scene.bonus === "forms" ? LINES.forms : LINES.bonus) : st.si === 0 ? LINES.tags : scene.name);
}

// What will cross the stage, and when: drawn from the trip's seed when the stage begins.
function schedule(st, scene, trip) {
  const len = stageLen(scene), out = [];
  const at = () => 20 + ri(st, len - 380);
  if (scene.bonus === "birds") {
    for (let k = 0; k < 9; k++) { const t = 30 + k * Math.floor((len - 160) / 9) + ri(st, 40), n = 1 + ri(st, 2); for (let j = 0; j < n; j++) out.push({ at: t + j * 12, kind: "bird", gold: rand(st) < 0.08 }); }
  } else if (scene.bonus === "forms") {
    for (let k = 0; k < 10; k++) { const t = 30 + k * Math.floor((len - 160) / 10) + ri(st, 30), n = 1 + ri(st, 2); for (let j = 0; j < n; j++) out.push({ at: t + j * 10, kind: "form", gold: rand(st) < 0.1 }); }
  } else if (trip.decoys) {
    for (let k = 0; k < 8; k++) out.push({ at: 20 + k * Math.floor((len - 300) / 8) + ri(st, 60), kind: "decoy" });
    for (let k = 0; k < 3; k++) out.push({ at: at(), kind: "female" });
  } else {
    const nm = 4 + ri(st, 3), nf = 3 + ri(st, 3), nc = 1 + ri(st, 2);
    out.push({ at: 40 + ri(st, 120), kind: "male" });   // one early: the stage always offers its quota
    for (let k = 1; k < nm; k++) out.push({ at: at(), kind: "male" });
    for (let k = 0; k < nf; k++) out.push({ at: at(), kind: "female" });
    for (let k = 0; k < nc; k++) out.push({ at: at(), kind: "critter" });
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---- the creatures ----------------------------------------------------------------------------------
function spawn(st, e) {
  const scene = sceneOf(st), trip = TRIP[st.cfg.trip], sp = SPECIES_BY[trip.sp];
  const id = st.nextId++;
  if (e.kind === "bird") {
    const x = st.cam + 30 + ri(st, W - 60), s = 0.8 + rand(st) * 0.5, vx = (rand(st) < 0.5 ? -1 : 1) * (0.7 + rand(st) * 0.9);
    st.targets.push({ id, kind: "bird", gold: e.gold, x, y: H - 30 - ri(st, 20), vx, vy: -(0.7 + rand(st) * 0.6), s, zig: 40 + ri(st, 50), t: 0, state: "fly", born: st.tick });
    return;
  }
  if (e.kind === "form") {
    const x = st.cam + 40 + ri(st, W - 80), s = 0.9 + rand(st) * 0.4;
    st.targets.push({ id, kind: "form", gold: e.gold, x, y: H + 6, vx: (rand(st) < 0.5 ? -1 : 1) * (0.3 + rand(st) * 0.7), vy: -(2.3 + rand(st) * 0.7), s, t: 0, state: "fly", born: st.tick });
    return;
  }
  const d = 0.1 + ri(st, 86) / 100;
  if (e.kind === "decoy") {
    const pts = 6 + ri(st, 7), size = ri(st, 100);
    st.targets.push({ id, kind: "decoy", male: true, sp: sp.id, pts, size, x: 30 + ri(st, W - 60), d, dir: rand(st) < 0.5 ? -1 : 1, state: "up", t: 0, up: 150 + ri(st, 110), born: st.tick });
    return;
  }
  if (e.kind === "critter") {
    const cs = rand(st) < 0.6 ? "rabbit" : "turkey", dir = rand(st) < 0.5 ? -1 : 1, s = scaleOf(d);
    st.targets.push({ id, kind: "critter", sp: cs, x: dir > 0 ? st.cam - 12 * s : st.cam + W + 12 * s, d, dir, state: "walk", t: 0, born: st.tick, stopX: null, wait: 0 });
    return;
  }
  const male = e.kind === "male";
  let pts = 0, size = 0;
  if (male) { const r = rand(st); pts = sp.pts[0] + Math.floor(r * r * (sp.pts[1] - sp.pts[0] + 1)); size = ri(st, 100); }
  const s = scaleOf(d), dir = rand(st) < 0.5 ? -1 : 1;
  let x = dir > 0 ? st.cam - sp.w * s * 0.7 : st.cam + W + sp.w * s * 0.7;
  // three in ten step out from behind cover in view instead of walking in from the edge
  if (rand(st) < 0.3) { const cv = scene.cover.filter(([cx, cw]) => cx + cw / 2 - st.cam > 40 && cx + cw / 2 - st.cam < W - 40); if (cv.length) { const c = cv[ri(st, cv.length)]; x = c[0] + c[1] / 2; } }
  const stopX = st.cam + 50 + ri(st, W - 100);   // where it stops to look, once
  st.targets.push({ id, kind: male ? "male" : "female", male, sp: sp.id, pts, size, x, d, dir, state: "walk", t: 0, born: st.tick, stopX, wait: 40 + ri(st, 70) });
}

function move(st, a) {
  a.t++;
  if (a.kind === "bird") {
    if (a.state === "down") { a.y += 1.6; a.vy = 0; if (a.y > H + 10) a.state = "gone"; return; }
    if (a.t % a.zig === 0) a.vx = -a.vx;
    a.x += a.vx; a.y += a.vy;
    if (a.y < -16 || a.x < st.cam - 30 || a.x > st.cam + W + 30) a.state = "gone";
    return;
  }
  if (a.kind === "form") {
    if (a.state === "down") { a.t > 30 && (a.state = "gone"); return; }
    a.x += a.vx; a.y += a.vy; a.vy += 0.035;
    if (a.y > H + 12 && a.vy > 0) a.state = "gone";
    return;
  }
  if (a.state === "down") { if (a.t > 90) a.state = "gone"; return; }
  if (a.kind === "decoy") { if (a.state === "up" && a.t > a.up) { a.state = "drop"; a.t = 0; } else if (a.state === "drop" && a.t > 10) a.state = "gone"; return; }
  const s = scaleOf(a.d);
  const base = a.kind === "critter" ? CRITTERS[a.sp] : SPECIES_BY[a.sp];
  if (a.state === "stop") { if (a.t >= a.wait) { a.state = "walk"; a.t = 0; } return; }
  const v = a.state === "run" ? (base.run || base.speed * 2.5) : base.speed;
  const was = a.x;
  a.x += a.dir * v * s;
  if (a.state === "walk" && a.stopX != null && (was - a.stopX) * (a.x - a.stopX) <= 0) { a.state = "stop"; a.t = 0; a.stopX = null; }
  const m = (base.w || 30) * s;
  if (a.x < st.cam - m - 4 || a.x > st.cam + W + m + 4) a.state = "gone";
}

// Where a shot lands on an animal, in its own frame (facing right): "head" | "vital" | "body" | null.
// The legs and the antlers are a clean miss. Exported for the renderer's debug and the checks.
export function regionAt(a, scene, wx, sy) {
  const s = scaleOf(a.d), fy = groundY(scene, a.d);
  if (a.kind === "critter") { const c = CRITTERS[a.sp], w = c.w * s, h = c.h * s; return Math.abs(wx - a.x) <= w / 2 && sy <= fy && sy >= fy - h ? "body" : null; }
  const sp = SPECIES_BY[a.sp], bw = sp.w * s, bh = sp.h * s;
  if (a.kind === "decoy" && a.state !== "up") return null;
  if (a.kind === "decoy" && a.t < 8) return null;   // still rising
  const lx = (wx - a.x) * a.dir, ly = sy - fy;
  const inR = (x0, x1, y0, y1) => lx >= x0 * bw && lx <= x1 * bw && ly >= y0 * bh && ly <= y1 * bh;
  if (inR(0.30, 0.56, -1.12, -0.70)) return "head";
  if (inR(0.06, 0.26, -0.80, -0.50)) return "vital";
  if (inR(-0.50, 0.34, -0.86, -0.44)) return "body";
  return null;
}
// The aim points (screen px) the pad's aim assist leans toward: legal targets only, never a female.
export function aimPoints(st) {
  const scene = sceneOf(st), out = [];
  for (const a of st.targets) {
    if (a.state === "down" || a.state === "gone" || a.state === "drop") continue;
    if (a.kind === "bird" || a.kind === "form") { out.push({ x: a.x - st.cam, y: a.y, r: 8 * a.s }); continue; }
    if (a.kind === "female") continue;
    const s = scaleOf(a.d), fy = groundY(scene, a.d);
    if (a.kind === "critter") { const c = CRITTERS[a.sp]; out.push({ x: a.x - st.cam, y: fy - c.h * s / 2, r: c.w * s / 2 }); continue; }
    const sp = SPECIES_BY[a.sp];
    out.push({ x: a.x - st.cam + a.dir * 0.16 * sp.w * s, y: fy - 0.65 * sp.h * s, r: 0.1 * sp.w * s + 2 });
  }
  return out;
}
const blocked = (scene, wx, sy) => scene.cover.some(([x, w, y0]) => wx >= x && wx <= x + w && sy >= y0);
export const inchesOf = (sp, pts, size) => SPECIES_BY[sp].inch0 + pts * SPECIES_BY[sp].perPt + size;
// A male's points: the antlers, the size, where it was hit, how quickly.
export function maleScore(sp, pts, size, region, age) {
  const base = SPECIES_BY[sp].base * pts + size * 2;
  const m = region === "vital" ? base * RULES.VITAL : region === "head" ? Math.floor((base * RULES.HEAD_NUM) / RULES.HEAD_DEN) : base;
  return m + Math.max(0, Math.floor((RULES.QUICK - age) / 2));
}

// ---- a shot -----------------------------------------------------------------------------------------
function shoot(st, sx, sy) {
  const scene = sceneOf(st), wx = sx + st.cam;
  st.shots++; st.ammo--; st.cool = RULES.COOLDOWN;
  st.ev.push("shot");
  st.fx.push({ k: "flash", x: sx, y: sy, t: st.tick });
  // nearest first: the birds and the forms, then the animals front to back
  const order = st.targets.filter(a => a.state !== "down" && a.state !== "gone").sort((a, b) => ((b.kind === "bird" || b.kind === "form") ? 2 : b.d) - ((a.kind === "bird" || a.kind === "form") ? 2 : a.d) || a.id - b.id);
  let hit = null, region = null;
  for (const a of order) {
    if (a.kind === "bird") { if (Math.abs(wx - a.x) <= 7 * a.s && Math.abs(sy - a.y) <= 5 * a.s) { hit = a; region = "body"; break; } continue; }
    if (a.kind === "form") { if (Math.abs(wx - a.x) <= 6 * a.s && Math.abs(sy - a.y) <= 7 * a.s) { hit = a; region = "body"; break; } continue; }
    const r = regionAt(a, scene, wx, sy);
    if (r) {
      // the cover is in front of every animal: a shot into a trunk stops there
      if (blocked(scene, wx, sy)) break;
      hit = a; region = r; break;
    }
  }
  if (!hit && blocked(scene, wx, sy)) { st.ev.push("thud"); st.fx.push({ k: "chip", x: sx, y: sy, t: st.tick }); }
  // the shot spooks everything near it that is still on its feet
  for (const a of st.targets) {
    if (a === hit || !(a.state === "walk" || a.state === "stop") || a.kind === "bird" || a.kind === "form" || a.kind === "decoy") continue;
    if (Math.abs(a.x - wx) < 90) { a.state = "run"; a.t = 0; a.dir = a.x < wx ? -1 : 1; st.ev.push("bolt"); }
  }
  if (!hit) return;
  const age = st.tick - hit.born;
  hit.state = "down"; hit.t = 0; hit.hitAt = st.tick; hit.region = region;
  let pts = 0;
  if (hit.kind === "male" || hit.kind === "decoy") {
    pts = maleScore(hit.sp, hit.pts, hit.size, region, age);
    st.hits++; st.stage.males++;
    st.kills.push({ sp: hit.sp, decoy: hit.kind === "decoy", pts: hit.pts, size: hit.size, region, score: pts, stage: st.si, inches: inchesOf(hit.sp, hit.pts, hit.size) });
    st.ev.push(region === "vital" ? "vital" : region === "head" ? "head" : "hit");
    say(st, hit.kind === "decoy" ? `${LINES.decoy} +${pts}` : `${hit.pts} POINT ${SPECIES_BY[hit.sp].male}. ${region === "vital" ? "BEHIND THE SHOULDER" : region === "head" ? "HEAD SHOT" : "BODY SHOT"}. +${pts}`);
  } else if (hit.kind === "female") {
    pts = RULES.FEMALE; st.strikes++; st.stage.females++;
    st.ev.push("female");
    say(st, LINES.female[(st.strikes - 1) % LINES.female.length]);
  } else if (hit.kind === "critter") {
    pts = RULES.CRITTER; st.hits++; st.stage.critters++; st.ev.push("critter");
    say(st, `${hit.sp === "rabbit" ? "A RABBIT" : "A TURKEY"}. +${pts}`);
  } else if (hit.kind === "bird") {
    pts = hit.gold ? RULES.GOLD : RULES.BIRD; st.hits++; st.stage.birds++; st.ev.push(hit.gold ? "gold" : "bird");
    if (hit.gold) say(st, `THE GOLDEN DUCK. +${pts}`);
  } else if (hit.kind === "form") {
    pts = hit.gold ? RULES.FORM_GOLD : RULES.FORM; st.hits++; st.stage.birds++; st.ev.push(hit.gold ? "gold" : "bird");
    if (hit.gold) say(st, `A GOLD-SEALED FORM. FILED. +${pts}`);
  }
  st.score += pts; st.stage.points += pts;
  st.fx.push({ k: "pts", x: sx, y: sy, v: pts, t: st.tick });
}

// ---- a tick -----------------------------------------------------------------------------------------
// x, y: the reticle (game px; x = OFF off the screen), b: BTN bits.
export function step(st, x = OFF, y = OFF, b = 0) {
  if (st.phase === "done") return st;
  st.tick++;
  const off = x < 0 || y < 0 || x >= W || y >= H;
  if (!off) { st.px = x; st.py = y; }
  const fire = (b & BTN.FIRE) && !(st.prevB & BTN.FIRE), rel = (b & BTN.RELOAD) && !(st.prevB & BTN.RELOAD);
  st.prevB = b;
  if (st.cool > 0) st.cool--;
  if (st.reload > 0 && --st.reload === 0) { st.ammo = RULES.SHELLS; st.ev.push("racked"); }
  if ((rel || (fire && off)) && st.reload === 0 && st.ammo < RULES.SHELLS) { st.reload = RULES.RELOAD_TICKS; st.ev.push("reload"); }
  st.fx = st.fx.filter(f => st.tick - f.t < 50);
  st.pt++;
  if (st.phase === "title") {
    if (st.pt >= RULES.TITLE_TICKS) { st.phase = "play"; st.pt = 0; }
    return st;
  }
  if (st.phase === "clear") {
    if (st.pt >= RULES.CLEAR_TICKS) {
      if (st.end || st.si + 1 >= TRIP[st.cfg.trip].scenes.length) finish(st);
      else { st.si++; beginStage(st); }
    }
    return st;
  }
  // play
  const scene = sceneOf(st), len = stageLen(scene);
  st.cam = (scene.travel * st.pt) / len;
  while (st.sched.length && st.sched[0].at <= st.pt) spawn(st, st.sched.shift());
  for (const a of st.targets) move(st, a);
  st.targets = st.targets.filter(a => a.state !== "gone");
  if (fire && !off) {
    if (st.reload > 0 || st.cool > 0) { /* the action is still being worked */ }
    else if (st.ammo <= 0) { st.ev.push("click"); say(st, LINES.reload); }
    else shoot(st, x, y);
  }
  if (st.strikes >= RULES.STRIKES && !st.end) { st.end = "revoked"; say(st, LINES.revoked); st.ev.push("revoked"); tally(st); return st; }
  if (st.pt >= len) tally(st);
  return st;
}

function tally(st) {
  const scene = sceneOf(st);
  let bonus = 0;
  if (!scene.bonus) bonus = st.stage.males * RULES.TAG_BONUS;
  st.score += bonus; st.stage.points += bonus; st.stage.bonus = bonus;
  st.stages.push({ ...st.stage });
  if (!st.end && !scene.bonus && st.stage.males < RULES.QUOTA) { st.end = "quota"; say(st, LINES.quota); }
  else if (!st.end) { say(st, scene.bonus ? `BONUS: ${st.stage.points} POINTS.` : `${LINES.filled} ${st.stage.males} FILED. +${bonus}`); }
  st.ev.push("clear");
  st.phase = "clear"; st.pt = 0; st.targets = st.targets.filter(a => a.state === "down");
}

function finish(st) {
  st.bonus = st.shots ? Math.floor((RULES.ACCURACY * st.hits) / st.shots) : 0;
  st.score = Math.max(0, st.score + st.bonus);
  if (!st.end) st.end = "complete";
  const real = st.kills.filter(k => !k.decoy);
  const pool = real.length ? real : st.kills;
  st.trophy = pool.reduce((b, k) => (!b || k.inches > b.inches || (k.inches === b.inches && k.score > b.score) ? k : b), null);
  st.phase = "done"; st.ev.push("done");
}

// The trip's result, for the board and the endpoint.
export function resultOf(st) {
  return { trip: st.cfg.trip, score: st.score, shots: st.shots, hits: st.hits, strikes: st.strikes, end: st.end, stages: st.stages.length, males: st.kills.length, bonus: st.bonus, trophy: st.trophy ? { sp: st.trophy.sp, pts: st.trophy.pts, inches: st.trophy.inches, decoy: st.trophy.decoy } : null, ticks: st.tick };
}

// ---- the log: run-length [x, y, bits, n, ...] ----------------------------------------------------------
export function logPush(log, x, y, b) {
  const n = log.length;
  if (n >= 4 && log[n - 4] === x && log[n - 3] === y && log[n - 2] === b) log[n - 1]++;
  else log.push(x, y, b, 1);
}
export const logTicks = (log) => { let t = 0; for (let i = 3; i < log.length; i += 4) t += log[i]; return t; };
export function logValid(log) {
  if (!Array.isArray(log) || log.length % 4) return false;
  for (let i = 0; i < log.length; i += 4) {
    const [x, y, b, n] = [log[i], log[i + 1], log[i + 2], log[i + 3]];
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(b) || !Number.isInteger(n)) return false;
    if (x < OFF || x >= W || y < OFF || y >= H || b < 0 || b > 3 || n < 1) return false;
  }
  return true;
}
// The pointer as the sim hears it: whole game pixels, OFF when outside the frame.
export const quantize = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? [OFF, OFF] : [Math.floor(x), Math.floor(y)]);

export function replay(cfg, log, { maxTicks = null } = {}) {
  if (cfg.v != null && cfg.v !== VERSION) throw new Error(`THIS LOG IS FROM VERSION ${cfg.v} OF THE CABINET. THIS IS VERSION ${VERSION}.`);
  const st = newHunt(cfg), cap = maxTicks ?? tripTicks(st.cfg.trip);
  for (let i = 0; i < log.length && st.phase !== "done"; i += 4) {
    for (let k = 0; k < log[i + 3] && st.phase !== "done"; k++) { if (st.tick >= cap) return st; step(st, log[i], log[i + 1], log[i + 2]); st.ev.length = 0; }
  }
  return st;
}
// The endpoint's check: the log replays to a finished trip with exactly the claimed score.
export function verifyHunt(cfg, log, claim) {
  if (!logValid(log)) return { ok: false, error: "THE LOG IS NOT LEGIBLE." };
  let st;
  try { st = replay(cfg, log); } catch (e) { return { ok: false, error: e.message }; }
  if (st.phase !== "done") return { ok: false, error: "THAT TRIP IS NOT OVER. THE DEPARTMENT FILES FINISHED TRIPS." };
  if (!claim || claim.score !== st.score) return { ok: false, error: `THE REPLAY SAYS ${st.score}. THE CLAIM SAYS ${claim?.score}. THE REPLAY IS ON FILE.` };
  return { ok: true, result: resultOf(st), ticks: st.tick };
}

// ---- the attract mode: the Department's own marksman (deterministic: reads only the state) -----------
// -> [x, y, bits]. Aims at the nearest legal target's aim point, a few pixels a tick; fires on it.
export function botInput(st, skill = 1) {
  if (st.phase !== "play") return [Math.round(st.px), Math.round(st.py), 0];
  if (st.ammo <= 0 && st.reload === 0) return [OFF, OFF, st.prevB & BTN.FIRE ? 0 : BTN.FIRE];
  const scene = sceneOf(st);
  let best = null, bd = Infinity;
  for (const p of aimPoints(st)) {
    if (p.x < 6 || p.x > W - 6 || p.y < 6 || p.y > H - 6 || blocked(scene, p.x + st.cam, p.y)) continue;
    const d = Math.abs(p.x - st.px) + Math.abs(p.y - st.py);
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) return [Math.round(st.px), Math.round(st.py), 0];
  const sp = 3 + 3 * skill;
  const mv = (a, b) => (Math.abs(b - a) <= sp ? b : a + Math.sign(b - a) * sp);
  const x = Math.round(mv(st.px, best.x)), y = Math.round(mv(st.py, best.y));
  const on = Math.abs(x - best.x) <= 1.5 && Math.abs(y - best.y) <= 1.5;
  const b = on && st.cool === 0 && st.reload === 0 && !(st.prevB & BTN.FIRE) ? BTN.FIRE : 0;
  return [Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)), b];
}
export function autoplay(cfg, skill = 1) {
  const st = newHunt(cfg), log = [], cap = tripTicks(st.cfg.trip);
  while (st.phase !== "done" && st.tick < cap) { const [x, y, b] = botInput(st, skill); logPush(log, x, y, b); step(st, x, y, b); st.ev.length = 0; }
  return { st, log };
}
