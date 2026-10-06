// THE MOUNTAIN, skiable: the guidance. Where to go next and what to say, from the state alone. Pure
// (node and the browser; reads the sim's state, never writes it). The page draws it: the objective
// arrow at the screen's edge, the mini-map's target, the one-line hint, the big prompt. The
// first-timer bot in scripts/check-ski.mjs reads nothing else: if the bot can get from the base to a
// challenge on this alone, so can a person.
//
// THE PHASES (one at a time, the first that fits):
//   wait     in the lift line, the chair not here yet
//   lift     riding up (the goal: the top)
//   zone     standing in a lift's glowing zone: press A (or stand two seconds)
//   ch       in a challenge: the next gate, checkpoint, the finish
//   flag     by a challenge's flag: press R / Y to start it
//   top      just off a lift: pick a trail (the goal: a flag up here, else the easiest trail head)
//   base     the bottom of the mountain: ride a lift (the goal: the nearest lift's zone)
//   run      on the way down: the next flag below you, else a lift's zone below you
// Button names in the text are tokens the page fills in for the hands in use: {A} (jump / ride),
// {B} (brake), {R} (start a challenge).
import { LIFTS_W, LIFT_W, LOAD_R2, RUNS, POI, BLOCKS, heightAt, baseH, polyAt, polyNear, crosses, liftRideTicks, BIG_AIR, PIPE, POOL } from "./world.js";
import { CHALLENGE, RUNNABLE, gatesOf, linesOf, instructorAt } from "./challenges.js";

const BASE_Z = 40;          // below this the rider is at the bottom of the mountain
const TOP_R = 260;          // "just off the lift": this close to where it put you off...
const TOP_DROP = 30;        // ...and not this far below it
const FLAG_R = 40;          // sim.js challengeNear's reach
const RATE_ORDER = { green: 0, blue: 1, black: 2, double: 3 };
export const RATE_COL = { green: "#16a34a", blue: "#2563eb", black: "#111827", double: "#111827" };
const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

// the trails that start at a lift's top
export const HEADS = Object.fromEntries(LIFTS_W.map(L => [L.id, RUNS.filter(R => R.from === L.id).map(R => { const [x, y, dx, dy] = polyAt(R, 30); return { id: R.id, name: R.name, rating: R.rating, x, y, dx, dy }; }).sort((a, b) => RATE_ORDER[a.rating] - RATE_ORDER[b.rating])]));

// memory between frames (the page and the bot each keep one): which lift put you off, and when
export function createGuide() { return { top: null }; }

// A world direction -> the screen (x right, y down), by the sim's camera
export function toScreen(st, wx, wy) {
  const sx = wx * st.cy - wy * st.cx, sy = wx * st.cx + wy * st.cy, n = Math.sqrt(sx * sx + sy * sy) || 1;
  return [sx / n, sy / n];
}

// -> {phase, hint, big, goal: {x, y, z, kind, name, col, dist, arrow: [sx, sy]} | null, heads, near, lift}
// (after every tick: a lift's unload is one tick's event, and a frame may run several ticks)
export function noteEvents(M, st) {
  for (const e of st.ev || []) if (e[0] === "unload") { const L = LIFTS_W.find(l => l.name === e[1]); if (L) M.top = { id: L.id, x: L.off[0], y: L.off[1], z: heightAt(L.off[0], L.off[1]), t: st.t }; }
  if (st.mode === "lift") M.top = null;
}
export function guide(M, st, opts = {}) {
  const medals = opts.medals || {};
  noteEvents(M, st);
  const out = { phase: "run", hint: "", big: "", goal: null, heads: null, near: null, lift: null };
  const goal = (x, y, kind, name, col = "#facc15") => {
    const dx = x - st.x, dy = y - st.y, [ax, ay] = aimAt(st, x, y, kind);
    out.goal = { x, y, z: baseH(x, y), kind, name, col, dist: Math.round(Math.sqrt(dx * dx + dy * dy)), arrow: toScreen(st, ax - st.x, ay - st.y) };
  };
  // on a lift
  if (st.mode === "lift") {
    const L = LIFT_W[st.lift.id];
    out.lift = L;
    goal(L.off[0], L.off[1], "top", `TOP OF ${L.name}`, "#38bdf8");
    if (st.lift.ph === "wait") { out.phase = "wait"; out.big = `THE NEXT ${L.kind === "gondola" ? "CABIN" : "CHAIR"} IS COMING: ${Math.max(1, Math.ceil(st.lift.n / 60))} S`; out.hint = "WAIT IN THE LINE"; }
    else { out.phase = "lift"; out.big = st.ff ? "RIDING TO THE TOP. SPEEDING UP (6X)" : "RIDING TO THE TOP. HOLD {A} TO SPEED UP"; out.hint = `${Math.max(0, Math.ceil((liftRideTicks(L) - st.lift.k) / 60 / (st.ff ? 6 : 1)))} S TO THE TOP`; }
    return out;
  }
  // in a challenge
  if (st.ch) {
    out.phase = "ch";
    const C = CHALLENGE[st.ch.id];
    if (st.ch.ph === "done") { out.hint = "CHALLENGE OVER"; return out; }
    const gates = gatesOf(C), { cps, finish } = linesOf(C);
    if (gates && st.ch.gi < gates.length) { const g = gates[st.ch.gi]; goal(g.x, g.y, "gate", `GATE ${st.ch.gi + 1}`, g.col); out.hint = "BETWEEN EACH PAIR OF POLES"; }
    else if (C.kind === "trial" && cps.some((c, i) => !(st.ch.cp & (1 << i)))) { const i = cps.findIndex((c, k) => !(st.ch.cp & (1 << k))); goal(cps[i].x, cps[i].y, "finish", `CHECKPOINT ${i + 1}`, "#eab308"); out.hint = "THROUGH EVERY CHECKPOINT"; }
    else if (C.kind === "descent") { goal(POI.base.x, POI.base.y, "finish", "THE BASE", "#dc2626"); out.hint = "DOWN TO THE BASE, ANY WAY"; }
    else if (C.kind === "jump") { goal(BIG_AIR.x, BIG_AIR.y, "finish", "THE KICKER", "#f97316"); out.hint = "TUCK, HOLD {A}, LET GO AT THE LIP"; }
    else if (C.kind === "follow") { const I = instructorAt(st.ch.tc); goal(I.x, I.y, "gate", "THE INSTRUCTOR", "#ef4444"); out.hint = "STAY CLOSE TO THE INSTRUCTOR"; }
    else if (C.kind === "pipe") { goal(PIPE.ax + PIPE.dx * PIPE.len, PIPE.ay + PIPE.dy * PIPE.len, "finish", "THE PIPE'S END", "#dc2626"); out.hint = "RIDE UP THE WALLS"; }
    else if (C.kind === "skim") { goal(POOL.x, POOL.y, "finish", "THE POOL", "#38bdf8"); out.hint = "FAST INTO THE WATER"; }
    else if (finish) { goal(finish.x, finish.y, "finish", "THE FINISH", "#dc2626"); out.hint = C.kind === "score" ? "LAND TRICKS ON THE WAY DOWN" : "TO THE FINISH"; }
    if (st.ch.ph === "count") out.big = "GET READY";
    return out;
  }
  // in a lift's zone
  for (const L of LIFTS_W) {
    if (d2(st.x, st.y, L.zone[0], L.zone[1]) < LOAD_R2 * LOAD_R2) {
      out.phase = "zone"; out.lift = L;
      goal(L.zone[0], L.zone[1], "lift", L.name, "#facc15");
      out.big = "PRESS {A} TO RIDE THE LIFT"; out.hint = `${L.name}: STAND HERE TWO SECONDS AND IT TAKES YOU`;
      return out;
    }
  }
  // just off a lift (the first five seconds win over a flag beside the unload)
  const fresh = M.top && st.t - M.top.t < 300 && d2(st.x, st.y, M.top.x, M.top.y) < TOP_R * TOP_R;
  // by a challenge's flag
  if (!fresh) for (const C of RUNNABLE) {
    if (d2(st.x, st.y, C.start.x, C.start.y) < FLAG_R * FLAG_R) {
      out.phase = "flag"; out.near = C;
      goal(C.start.x, C.start.y, "flag", C.name, "#f97316");
      out.big = `PRESS {R} TO START: ${C.name}`; out.hint = "A CHALLENGE. OR SKI ON";
      return out;
    }
  }
  // just off a lift
  if (M.top && d2(st.x, st.y, M.top.x, M.top.y) < TOP_R * TOP_R && st.z > M.top.z - TOP_DROP) {
    out.phase = "top";
    out.heads = HEADS[M.top.id] || [];
    out.hint = "CHOOSE A TRAIL. THE ARROWS ARE THE TRAIL HEADS";
    if (st.t - M.top.t < 300) out.big = "PICK A TRAIL";
    const by = RUNNABLE.find(C => d2(st.x, st.y, C.start.x, C.start.y) < FLAG_R * FLAG_R);
    if (by) { out.near = by; out.hint = `PICK A TRAIL, OR PRESS {R} TO START: ${by.name}`; }
    // the arrow: the easiest trail from here (a flag off to the side is named in the hint)
    const fl = by ? null : nearestFlag(st, medals, 380, Infinity);
    if (out.heads.length) { const H = out.heads[0]; goal(H.x, H.y, "trail", H.name, RATE_COL[H.rating] === "#111827" ? "#f8fafc" : RATE_COL[H.rating]); }
    else if (fl) goal(fl.start.x, fl.start.y, "flag", fl.name, "#f97316");
    if (fl && out.heads.length) out.hint = `CHOOSE A TRAIL. A FLAG NEARBY: ${fl.name}`;
    return out;
  }
  // at the bottom
  if (st.z < BASE_Z) {
    out.phase = "base"; out.hint = "RIDE A LIFT. FOLLOW THE ARROW";
    const L = nearestLift(st, BASE_Z);
    if (L) goal(L.zone[0], L.zone[1], "lift", L.name, "#facc15");
    return out;
  }
  // on the way down
  const fl = nearestFlag(st, medals, 700, st.z - 4);
  if (fl) { goal(fl.start.x, fl.start.y, "flag", fl.name, "#f97316"); out.hint = "FOLLOW THE POLES TO THE NEXT FLAG"; return out; }
  const L = nearestLift(st, st.z + 6);
  if (L) { goal(L.zone[0], L.zone[1], "lift", L.name, "#facc15"); out.hint = "FOLLOW THE POLES DOWN TO A LIFT"; }
  else { goal(POI.base.x, POI.base.y, "lift", "THE BASE", "#facc15"); out.hint = "FOLLOW THE POLES DOWN"; }
  return out;
}
// Where the arrow points on the way to (x, y): round a building in the way (to its nearer corner),
// and on a trail heading the goal's way, along the trail (its poles) rather than through the trees
function aimAt(st, x, y, kind) {
  const m = 10;
  let hit = null, hd = Infinity;
  for (const B of BLOCKS) {
    const x0 = B.x0 - m, x1 = B.x1 + m, y0 = B.y0 - m, y1 = B.y1 + m;
    if (x > x0 && x < x1 && y > y0 && y < y1) continue;
    if (!(crosses(st.x, st.y, x, y, x0, y0, x1, y0) || crosses(st.x, st.y, x, y, x1, y0, x1, y1) || crosses(st.x, st.y, x, y, x1, y1, x0, y1) || crosses(st.x, st.y, x, y, x0, y1, x0, y0))) continue;
    const k = d2(st.x, st.y, (B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2);
    if (k < hd) { hd = k; hit = B; }
  }
  if (hit) {
    const c = 18, corners = [[hit.x0 - c, hit.y0 - c], [hit.x1 + c, hit.y0 - c], [hit.x1 + c, hit.y1 + c], [hit.x0 - c, hit.y1 + c]];
    let best = null, bl = Infinity;
    for (const [cx, cy] of corners) { const L = Math.sqrt(d2(st.x, st.y, cx, cy)) + Math.sqrt(d2(cx, cy, x, y)); if (L < bl && d2(st.x, st.y, cx, cy) > 36) { bl = L; best = [cx, cy]; } }
    if (best) return best;
  }
  if (kind === "flag" || kind === "lift" || kind === "trail") {
    const R = st.run >= 0 ? RUNS[st.run] : null, far = d2(st.x, st.y, x, y);
    if (R && far > 160 * 160) {
      const s = polyNear(R, st.x, st.y).s, [tx, ty] = polyAt(R, s + 70), gx = x - st.x, gy = y - st.y, ux = tx - st.x, uy = ty - st.y;
      const cos = (gx * ux + gy * uy) / (Math.sqrt(gx * gx + gy * gy) * Math.sqrt(ux * ux + uy * uy) || 1);
      if (cos > 0.2 && s + 70 < R.len) return [tx, ty];
    }
  }
  return [x, y];
}
// the nearest challenge flag within r m, its start below zMax (gold-medalled ones last)
function nearestFlag(st, medals, r, zMax) {
  let best = null, bd = r * r;
  for (const C of RUNNABLE) {
    const r2 = d2(st.x, st.y, C.start.x, C.start.y), k = r2 * ((medals[C.id] || 0) >= 3 ? 4 : 1);
    // (below you; or close, a little above: a flag you are arriving at does not drop out at the last)
    if (k < bd && (zMax === Infinity || baseH(C.start.x, C.start.y) < (r2 < 150 * 150 ? zMax + 14 : zMax))) { bd = k; best = C; }
  }
  return best;
}
// the nearest lift whose line is below zMax
function nearestLift(st, zMax) {
  let best = null, bd = Infinity;
  for (const L of LIFTS_W) { const k = d2(st.x, st.y, L.zone[0], L.zone[1]); if (k < bd && baseH(L.zone[0], L.zone[1]) < zMax) { bd = k; best = L; } }
  return best;
}
// The hint's button tokens, filled in for the hands in use
export function fillKeys(s, mode, glyph = {}) {
  if (!s) return s;
  const A = mode === "pad" ? glyph.act || "A" : mode === "touch" ? "JUMP" : "SPACE";
  const B = mode === "pad" ? glyph.back || "B" : mode === "touch" ? "BRAKE" : "X";
  const R = mode === "pad" ? "Y" : mode === "touch" ? "START CHALLENGE" : "R";
  return s.replace(/\{A\}/g, A).replace(/\{B\}/g, B).replace(/\{R\}/g, R);
}
