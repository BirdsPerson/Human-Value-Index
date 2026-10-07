// THE DUNGEON's first-timer bot (docs/design/DUNGEON.md 3.10). It knows nothing of a floor but what
// has been revealed (the rooms a player has entered, the doors beside them, monsters inside the
// 24 x 14 window in revealed rooms); it explores toward the nearest door into an unrevealed room, so
// it meets the loiter clock, the containers and the hatch curve as a person would. Its parameters are
// FIXED and published with engine v1 before any dial moved:
export const BOT = {
  react: 15, reactSpread: 6,   // 250 ms, +/- 100 ms (frames at 60 Hz)
  rollLate: 9,                 // it rolls 150 ms after its reaction to a telegraph
  coneCos: 0.9238795325112867, // its own 45-degree reading cone (whole width), not the assist dial
  openR: 3,                    // it opens every container it passes within 3 tiles
  coffeeAt: 8,                 // pips: it drinks a COFFEE at 2 hearts
  engageR: 4,                  // it turns to fight what comes within 4 tiles
  window: [12, 7],             // the camera window's half-size (24 x 14)
};
import { pack, headingOf, T, los } from "../src/play/crawl/engine/index.js";

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const passable = (t) => t !== T.WALL && t !== T.LOCKED && t !== T.CAB;

export function firstTimer(seed, opts = {}) {
  const B = { ...BOT, ...opts };
  const rnd = mulberry(seed ^ 0x9e3779b9);
  const mem = { floor: -1, noticed: new Map(), teleSeen: new Map(), rolled: new Set(), path: [], goal: -1, planAt: -99, stuckX: 0, stuckY: 0, stuckAt: 0, wiggle: 0, wigHead: 0, lastAtk: -99, lastUse: -99, lastAct: -99, react: B.react, cab: -1, pick: -1 };
  const reactNow = () => B.react + Math.round((rnd() * 2 - 1) * B.reactSpread);

  return function bot(st) {
    if (st.phase !== "floor" && st.phase !== "landing") return 0;
    const g = st.fl.g, W = g.w, seat = st.seats[0], P = st.ents.find(e => e.id === seat.ent);
    if (!P || P.hp <= 0) return 0;
    if (mem.floor !== st.floor) { mem.floor = st.floor; mem.noticed.clear(); mem.teleSeen.clear(); mem.rolled.clear(); mem.path = []; mem.goal = -1; mem.planAt = -99; }
    const f = st.frame, pi = Math.floor(P.y) * W + Math.floor(P.x);
    // what it knows: tiles of revealed rooms, doors beside them
    const known = (i) => { const r = g.room[i]; if (r >= 0) return st.rev[r] === 1; const t = g.t[i]; if (t !== T.DOOR && t !== T.LOCKED) return false; return st.rev[g.room[i - 1]] === 1 || st.rev[g.room[i + 1]] === 1 || st.rev[g.room[i - W]] === 1 || st.rev[g.room[i + W]] === 1; };
    const inView = (e) => Math.abs(e.x - P.x) <= B.window[0] && Math.abs(e.y - P.y) <= B.window[1] && known(Math.floor(e.y) * W + Math.floor(e.x));
    const out = { head: headingOf(P.fx, P.fy), mag: 0, slot: seat.slot };
    // a COFFEE at two hearts
    if (P.hp <= B.coffeeAt && f - mem.lastUse > 30) {
      const s = seat.pack.findIndex(it => it && it.k === "coffee");
      if (s >= 0) { mem.lastUse = f; if (seat.slot !== s) return pack({ ...out, slot: s }); return pack({ ...out, slot: s, use: true }); }
    }
    // what it has noticed (after its reaction time)
    const mons = [];
    for (const e of st.ents) {
      if (e.k !== "mon" || e.dead || !inView(e)) continue;
      if (!mem.noticed.has(e.id)) mem.noticed.set(e.id, f + reactNow());
      if (f >= mem.noticed.get(e.id)) mons.push(e);
    }
    // telegraphs: a roll, late
    for (const e of mons) {
      const tele = (e.s === "tele" && e.a === "charger") || (e.s === "wind" && e.a === "turret");
      if (!tele) { mem.teleSeen.delete(e.id); continue; }
      if (!mem.teleSeen.has(e.id)) mem.teleSeen.set(e.id, f + reactNow() + B.rollLate);
      const key = `${e.id}:${e.age - e.t}`;
      if (f >= mem.teleSeen.get(e.id) && !mem.rolled.has(key) && P.roll === 0) {
        mem.rolled.add(key);
        const dx = P.x - e.x, dy = P.y - e.y, sx = -dy, sy = dx;
        return pack({ ...out, head: headingOf(rnd() < 0.5 ? sx : -sx, rnd() < 0.5 ? sy : -sy), mag: 2, roll: true });
      }
    }
    // a fight: the nearest monster it has noticed within its engage range (never THE AUDITOR)
    let tgt = null, td = 1e9;
    for (const e of mons) { if (e.a === "stalker") continue; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < td && los(g, P.x, P.y, e.x, e.y)) { td = d; tgt = e; } }
    const huntAll = st.sealed && st.rev[st.fl.descentRoom] === 1;
    if (tgt && (td <= B.engageR || (huntAll && td <= 8))) {
      const dx = tgt.x - P.x, dy = tgt.y - P.y, ux = dx / (td || 1), uy = dy / (td || 1), inCone = td < 0.6 || ux * P.fx + uy * P.fy >= B.coneCos;
      if (td <= 1.15 + tgt.r && inCone) return pack({ ...out, attack: f % 2 === 0 });
      if ((tgt.a === "turret" || tgt.a === "generator") && td > 2 && inCone && P.toolCd === 0) return pack({ ...out, tool: true });
      if (td <= 1.15 + tgt.r) return pack({ ...out, head: headingOf(ux, uy), mag: 1 });   // turn to face it
      if (tgt.a !== "turret" || td < 6) return pack({ ...out, head: headingOf(ux, uy), mag: 2, tool: inCone && td > 2.5 && P.toolCd === 0 && rnd() < 0.3 });
    }
    // a goal
    const goalOf = () => {
      if (st.fl.lift && known(st.fl.descent.i)) return { i: st.fl.descent.i, act: true };
      if (st.hatch && known(st.hatch.i)) return { i: st.hatch.i, act: true };
      if (!st.fl.lift && known(st.fl.descent.i) && !st.sealed) return { i: st.fl.descent.i, act: true };
      // containers passed within 3 tiles; pickups in view
      let best = null, bd = 1e9;
      for (const e of st.ents) {
        if (e.dead || !inView(e)) continue;
        const d = Math.hypot(e.x - P.x, e.y - P.y);
        if (e.k === "cab" && (d <= B.openR || (e.id === mem.cab && d <= B.openR + 3)) && d < bd) { best = { i: e.i, cab: e }; bd = d; }
        if (e.k === "pick" && (d <= 6 || (e.id === mem.pick && d <= 9)) && d < bd && (e.item === "bounty" || e.item === "keycard" || seat.pack.some(s => !s))) { best = { i: Math.floor(e.y) * W + Math.floor(e.x), pick: e.id }; bd = d; }
      }
      mem.cab = best && best.cab ? best.cab.id : -1; mem.pick = best && best.pick ? best.pick : -1;   // once it has turned for a cabinet it sees it through
      if (best) return best;
      if (seat.keycard === st.floor && st.fl.storeDoor >= 0 && g.t[st.fl.storeDoor] === T.LOCKED && known(st.fl.storeDoor)) return { i: st.fl.storeDoor, act: true, door: true };
      if (huntAll) { for (const e of st.ents) if (e.k === "mon" && !e.dead && e.cnt && known(Math.floor(e.y) * W + Math.floor(e.x))) return { i: Math.floor(e.y) * W + Math.floor(e.x) }; }
      return null;
    };
    const goal = goalOf();
    // BFS over known passable tiles to the goal, or to the nearest frontier door
    const plan = () => {
      const dist = new Map([[pi, -1]]), q = [pi];
      const isGoal = (i) => (goal ? i === goal.i || (goal.cab && Math.abs((i % W) - (goal.i % W)) + Math.abs(Math.floor(i / W) - Math.floor(goal.i / W)) === 1) || (goal.door && Math.abs((i % W) - (goal.i % W)) + Math.abs(Math.floor(i / W) - Math.floor(goal.i / W)) === 1) : g.t[i] === T.DOOR && [i - 1, i + 1, i - W, i + W].some(j => g.room[j] >= 0 && !st.rev[g.room[j]]));
      for (let h = 0; h < q.length; h++) {
        const i = q[h];
        if (isGoal(i) && i !== pi) { const p = []; for (let k = i; k !== pi; k = dist.get(k)) p.push(k); return p.reverse(); }
        for (const j of [i - W, i + 1, i + W, i - 1]) {
          if (dist.has(j)) continue;
          const t = g.t[j];
          if (!(passable(t) || (goal && j === goal.i && goal.cab)) || !known(j)) continue;
          if (goal && goal.cab && j === goal.i) continue;
          dist.set(j, i); q.push(j);
        }
      }
      return null;
    };
    const gkey = goal ? goal.i : -2;
    if (gkey !== mem.goal || f - mem.planAt >= 12 || !mem.path.length) { mem.path = plan() || []; mem.goal = gkey; mem.planAt = f; }
    // at the goal
    if (goal && (goal.act || goal.door)) {
      const gx = (goal.i % W) + 0.5, gy = Math.floor(goal.i / W) + 0.5, d = Math.hypot(gx - P.x, gy - P.y);
      if (d < (goal.door ? 1.3 : 0.6) && f - mem.lastAct > 20) { mem.lastAct = f; return pack({ ...out, interact: true }); }
      if (d < 0.6) return pack(out);
    }
    if (goal && goal.cab) {
      const c = goal.cab, d = Math.hypot(c.x - P.x, c.y - P.y), ux = (c.x - P.x) / d, uy = (c.y - P.y) / d;
      if (d <= 1.4) return ux * P.fx + uy * P.fy >= B.coneCos ? pack({ ...out, attack: f % 2 === 0 }) : pack({ ...out, head: headingOf(ux, uy), mag: 1 });
    }
    // stuck: wiggle
    if (Math.hypot(P.x - mem.stuckX, P.y - mem.stuckY) > 0.3) { mem.stuckX = P.x; mem.stuckY = P.y; mem.stuckAt = f; }
    if (f - mem.stuckAt > 45 && mem.wiggle <= 0) { mem.wiggle = 18; mem.wigHead = Math.floor(rnd() * 16); mem.stuckAt = f; }
    if (mem.wiggle > 0) { mem.wiggle--; return pack({ ...out, head: mem.wigHead, mag: 2 }); }
    // follow the path
    while (mem.path.length && mem.path[0] === pi) mem.path.shift();
    const nx = mem.path.length ? (mem.path[0] % W) + 0.5 : null;
    if (nx == null) return pack(out);
    const ny = Math.floor(mem.path[0] / W) + 0.5;
    // aim at the tile after next when the straight line is clear (smoother corners)
    return pack({ ...out, head: headingOf(nx - P.x, ny - P.y), mag: 2 });
  };
}

// A whole run with the first-timer at the wheel -> {rec, st}
export async function botRun(S, cfg, opts = {}) {
  const st = S.newRun(cfg), bot = firstTimer(cfg.seed, opts), words = [], max = opts.max ?? 80000;
  for (let f = 0; f < max && st.phase !== "filed"; f++) { const w = bot(st); words.push(w); S.step(st, [w]); }
  return { st, rec: { v: S.VERSION, cfg, logs: [S.rleEncode(words)] } };
}
export function botRunSync(S, cfg, opts = {}) {
  const st = S.newRun(cfg), bot = firstTimer(cfg.seed, opts), words = [], max = opts.max ?? 80000;
  for (let f = 0; f < max && st.phase !== "filed"; f++) { const w = bot(st); words.push(w); S.step(st, [w]); }
  return { st, rec: { v: S.VERSION, cfg, logs: [S.rleEncode(words)] } };
}
