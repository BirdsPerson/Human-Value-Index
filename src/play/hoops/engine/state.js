// THE COURTS engine, state.js: the state's helpers: the seeded generator, who is human, who holds the ball, the event stream.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { len } from "./court.js";

// mulberry32 on the state's own word
export function rnd(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const gauss = (st) => (rnd(st) + rnd(st) + rnd(st) - 1.5) * 2;   // mean 0, sd 1, bounded at 3
export function hashStr(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// The level's dials for a player of team t: your side and the CPU against you see the level; a CPU
// v CPU game is as rated.
export const lv = (st) => st.lv;
export const you = (st, t) => t === 0 && !st.cfg.auto;

export const human = (st, P) => P.t === 0 && !st.cfg.auto && P.i === st.ctl;
export const holder = (st) => (st.ball.st === "held" ? st.p[st.ball.own] : null);
export function say(st, k, P = null, extra = {}) { st.ev.push(k); st.note = { k, g: P ? P.g : -1, team: P ? P.t : -1, frame: st.frame, ...extra }; }
export const markerOf = (st, M) => st.p.find(Q => Q.t !== M.t && st.mark[Q.g] === M.g) || null;

export const teamOf = (st, t) => st.p.filter(P => P.t === t);
// ---- the human ------------------------------------------------------------------------------------
export function nearestToBall(st, t, skip = -1) {
  const b = st.ball;
  let best = null, bd = 1e9;
  for (const P of st.p) if (P.t === t && P.g !== skip) { const k = len(P.x - b.x, P.y - b.y); if (k < bd) { bd = k; best = P; } }
  return best;
}
