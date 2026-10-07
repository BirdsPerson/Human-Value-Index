// The archetypes (docs/design/DUNGEON.md 3.5): the engine's behaviours; the theme binds monsters to
// them with numbers. D1 runs swarm, charger, turret, splitter, generator and stalker.
//   swarm      light bodies that flock (separation) and chase; a bite has a 12-frame windup
//   charger    chases (a bump with an 18-frame windup at contact); lined up and in sight it telegraphs 30 frames, charges 8 tiles in a straight
//              line, is stunned 40 frames on a wall
//   turret     stationary; turns slowly; a 24-frame flash, then a shot every `period` frames
//   splitter   wanders; drifts at you in sight; a 20-frame windup to a touch; splits on death
//   generator  spawns a bound monster every `every` frames (x the level's dial) while a player is near
//   stalker    THE AUDITOR: through walls and doors, accelerating, invulnerable, a 2-heart hit and a stagger
import { senses, stepToward, goHome, moveTo, nearestPlayer } from "./brain.js";
import { hurt, iframe, HZ, WALK } from "../combat.js";
import { newShot, newMon } from "../entities.js";
import { los, passable, N8 } from "../grid.js";
import { sdraw } from "../rng.js";

const per = (v) => v / HZ;
// THE AUDITOR's speed: 0.8 x walk rising 5 % every 10 s to 1.4 x (multiplied out, no pow)
export const STALK = (() => { const t = []; let f = 0.8; for (let k = 0; k < 20; k++) { t.push(f > 1.4 ? 1.4 : f); f *= 1.05; } return t; })();
export const stalkFactor = (age) => STALK[Math.min(STALK.length - 1, Math.floor(age / 600))];

function bite(st, e, P, d, M, wind, reach) {
  if (e.s === "wind") {
    e.t--;
    if (e.t <= 0) { if (d <= reach + 0.25) hurt(st, P, M.dmg, e.x, e.y, false, e.m); e.s = "chase"; e.cd = 45; }
    return true;
  }
  if (e.cd === 0 && d <= reach) { e.s = "wind"; e.t = wind; st.ev.push({ t: "tele", x: e.x, y: e.y, what: e.m, n: wind }); return true; }
  return false;
}

export function monFrame(st, th, e) {
  if (e.flash > 0) e.flash--;
  if (e.cd > 0) e.cd--;
  if (e.stun > 0) { e.stun--; return; }
  const M = th.monsters[e.m];
  e.age++;
  switch (e.a) {
    case "swarm": return swarm(st, e, M);
    case "charger": return charger(st, e, M);
    case "turret": return turret(st, e, M);
    case "splitter": return splitter(st, e, M);
    case "generator": return generator(st, th, e, M);
    case "stalker": return stalker(st, e, M);
    default: return undefined;
  }
}

// swarm bodies on tile i other than `self`
export function swarmOn(st, i, self) {
  const w = st.fl.g.w; let c = 0;
  for (const o of st.ents) if (o !== self && !o.dead && o.k === "mon" && o.a === "swarm" && Math.floor(o.y) * w + Math.floor(o.x) === i) c++;
  return c;
}
// move a swarm body, but never onto a tile that already holds two (it waits instead)
function swarmMove(st, e, fn) {
  const w = st.fl.g.w, x = e.x, y = e.y, i0 = Math.floor(y) * w + Math.floor(x);
  fn();
  const i1 = Math.floor(e.y) * w + Math.floor(e.x);
  if (i1 !== i0 && swarmOn(st, i1, e) >= 2) { e.x = x; e.y = y; }
}
function swarm(st, e, M) {
  const sn = senses(st, e, M.sight); if (!sn) return;
  const [P, d] = sn;
  if (bite(st, e, P, d, M, 12, 0.55 + e.r)) return;
  if (e.s === "chase") swarmMove(st, e, () => stepToward(st, e, P, d, per(M.speed)));
  else if (e.s === "home") swarmMove(st, e, () => goHome(st, e, per(M.speed) * 0.5));
  // separation: bodies keep apart
  for (const o of st.ents) {
    if (o === e || o.dead || o.k !== "mon" || o.a !== "swarm") continue;
    const dx = e.x - o.x, dy = e.y - o.y, q = dx * dx + dy * dy;
    if (q < 0.3 && q > 1e-9) { const n = Math.sqrt(q); swarmMove(st, e, () => moveTo(st.fl.g, e, e.x + dx / n, e.y + dy / n, 0.04)); }
    else if (q <= 1e-9) swarmMove(st, e, () => moveTo(st.fl.g, e, e.x + (e.id % 2 ? 1 : -1), e.y, 0.04));
  }
}

function charger(st, e, M) {
  const g = st.fl.g;
  if (e.s === "tele") {
    e.t--;
    if (e.t <= 0) { e.s = "charge"; e.dist = 0; st.ev.push({ t: "charge", x: e.x, y: e.y }); }
    return;
  }
  if (e.s === "charge") {
    const v = per(M.charge);
    const free = moveTo(g, e, e.x + e.dx, e.y + e.dy, v);
    e.fx = e.dx; e.fy = e.dy; e.dist += v;
    for (const P of st.ents) {
      if (P.k !== "player" || P.dead) continue;
      const dx = P.x - e.x, dy = P.y - e.y;
      if (dx * dx + dy * dy <= (e.r + P.r + 0.1) * (e.r + P.r + 0.1) && !iframe(P)) hurt(st, P, M.dmg, e.x - e.dx, e.y - e.dy, false, e.m);
    }
    if (!free) { e.s = "stun"; e.t = 40; st.ev.push({ t: "thud", x: e.x, y: e.y }); }
    else if (e.dist >= M.chargeTiles) { e.s = "chase"; e.cd = 70; }
    return;
  }
  if (e.s === "stun") { e.t--; if (e.t <= 0) { e.s = "chase"; e.cd = 50; } return; }
  const sn = senses(st, e, M.sight); if (!sn) return;
  const [P, d] = sn;
  if (e.s === "wind" || (e.s === "chase" && d <= 0.6 + e.r)) { if (bite(st, e, P, d, M, 18, 0.6 + e.r)) return; }
  if (e.s === "chase") {
    if (e.cd === 0 && d <= 7 && d > 1.2 && los(g, e.x, e.y, P.x, P.y)) {
      e.s = "tele"; e.t = 30; e.dx = (P.x - e.x) / d; e.dy = (P.y - e.y) / d; e.fx = e.dx; e.fy = e.dy;
      st.ev.push({ t: "tele", x: e.x, y: e.y, what: e.m, n: 30, dx: e.dx, dy: e.dy });
      return;
    }
    stepToward(st, e, P, d, per(M.speed));
  } else if (e.s === "home") goHome(st, e, per(M.speed) * 0.6);
}

// a turret turns at most ~3 degrees a frame (cos/sin written out)
const TC = 0.9986295347545738, TS = 0.05233595624294383;
function turret(st, e, M) {
  const sn = senses(st, e, M.sight); if (!sn) return;
  const [P, d] = sn;
  if (e.s === "home") e.s = "idle";
  if (e.s === "idle") return;
  const ux = (P.x - e.x) / (d || 1), uy = (P.y - e.y) / (d || 1);
  if (e.s === "wind") {
    e.t--;
    if (e.t <= 0) { newShot(st, "mon", e.x + e.fx * 0.5, e.y + e.fy * 0.5, e.fx * per(M.shot), e.fy * per(M.shot), Math.ceil(M.range / per(M.shot)), M.dmg).what = e.m; e.s = "chase"; e.cd = M.period; st.ev.push({ t: "shoot", x: e.x, y: e.y }); }
    return;
  }
  const c = e.fx * ux + e.fy * uy;
  if (c >= TC) { e.fx = ux; e.fy = uy; }
  else { const s = e.fx * uy - e.fy * ux >= 0 ? TS : -TS, nx = e.fx * TC - e.fy * s, ny = e.fx * s + e.fy * TC, n = Math.sqrt(nx * nx + ny * ny); e.fx = nx / n; e.fy = ny / n; }
  if (e.cd === 0 && d <= M.range && e.seen === 0 && e.fx * ux + e.fy * uy > 0.94) { e.s = "wind"; e.t = 24; st.ev.push({ t: "tele", x: e.x, y: e.y, what: e.m, n: 24 }); }
}

function splitter(st, e, M) {
  const sn = senses(st, e, M.sight); if (!sn) return;
  const [P, d] = sn;
  if (bite(st, e, P, d, M, 20, 0.5 + e.r)) return;
  if (e.s === "chase") { stepToward(st, e, P, d, per(M.speed)); return; }
  // wander inside a few tiles of home
  if (e.t <= 0) { e.t = 90 + Math.floor(sdraw(st, "ai") * 60); e.wx = e.hx + (sdraw(st, "ai") * 4 - 2); e.wy = e.hy + (sdraw(st, "ai") * 4 - 2); }
  e.t--;
  if (!moveTo(st.fl.g, e, e.wx, e.wy, per(M.wander))) e.t = 0;
}

function generator(st, th, e, M) {
  const [P, d] = nearestPlayer(st, e);
  if (!P || st.phase !== "floor") return;
  const near = d <= M.sight && (st.rev[st.fl.g.room[Math.floor(e.y) * st.fl.g.w + Math.floor(e.x)]] === 1);
  if (!near) return;
  e.t++;
  const every = Math.round(M.every / st.lv.gen);
  if (e.t < every) { if (e.t === every - 40) st.ev.push({ t: "tele", x: e.x, y: e.y, what: e.m, n: 40 }); return; }
  e.t = 0;
  let live = 0; for (const o of st.ents) if (!o.dead && o.bound === e.id) live++;
  if (live >= M.max) return;
  const g = st.fl.g, x = Math.floor(e.x), y = Math.floor(e.y);
  for (let k = 0; k < 8; k++) {
    const nx = x + N8[(k + st.frame) % 8][0], ny = y + N8[(k + st.frame) % 8][1];
    if (!passable(g.t[ny * g.w + nx]) || swarmOn(st, ny * g.w + nx, null) >= 2) continue;
    const c = newMon(st, th, M.spawn, nx + 0.5, ny + 0.5, { bound: e.id });
    c.s = "chase"; c.seen = 0;
    st.ev.push({ t: "spawn", x: c.x, y: c.y, what: M.spawn });
    return;
  }
}

function stalker(st, e, M) {
  // the seat that has loitered longest
  let P = null, best = -1;
  for (const p of st.ents) { if (p.k !== "player" || p.dead) continue; const L = st.seats[p.seat].loiter; if (L > best) { best = L; P = p; } }
  if (!P) return;
  if (e.cd > 0) return;   // paused after a finding
  const sp = WALK * stalkFactor(e.age);
  const dx = P.x - e.x, dy = P.y - e.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1e-6) { const s = sp < d ? sp : d; e.fx = dx / d; e.fy = dy / d; e.x += e.fx * s; e.y += e.fy * s; }
  if (d <= e.r + P.r + 0.1 && !iframe(P) && P.hurt === 0) {
    hurt(st, P, M.dmg, e.x, e.y, true, e.m);
    P.stun = 30; e.cd = M.pause;
    st.ev.push({ t: "audit", x: e.x, y: e.y, seat: P.seat });
  }
}
