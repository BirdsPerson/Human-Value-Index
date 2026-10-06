// FOURTH AND LONG: a casual human, as a script, for scripts/check-tecmo.mjs (and the tuning of ROOKIE).
// Not a good player: he reads the card for a second, calls a play at random, punts on 4th, runs at the
// goal and sidesteps the nearest man late, throws to whoever looks open about half the time, mashes A
// about seven times a second, times the kick meter roughly, and on defence chases the ball a beat late.
import { BTN, HZ, O, ELIGIBLE, KICK_PUNT, KICK_FG, kicksOpen, carrierOf, dirOf, toGoal, offMan } from "../src/play/tecmo/sim.js";

export function casualHuman(side, seed = 1) {
  let h = (seed * 2654435761) >>> 0 || 1;
  const r = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  let want = -1, wait = 0, throwAt = 0, presses = 0, kickErr = 0, steer = 0, mashNext = 0, tgt = null, phase = "", play = -1;
  return (st) => {
    let m = 0;
    if (st.phase !== phase) { phase = st.phase; wait = 30 + Math.floor(r() * 60); want = -1; presses = 0; kickErr = Math.round((r() - 0.5) * 14); throwAt = 35 + Math.floor(r() * 40); }
    const mine = st.poss === side;
    if (st.phase === "call") {
      if (st.call.lock[side] || st.pf < wait) return 0;
      if (want < 0) {
        const k = kicksOpen(st), togo = Math.abs(st.firstAt - st.los);
        if (mine && st.down === 4 && k.fg && toGoal(side, st.los) <= 30) want = KICK_FG;
        else if (mine && st.down === 4 && togo > 2 && k.punt) want = KICK_PUNT;
        else want = Math.floor(r() * 4);
      }
      const cur = st.call.cur[side];
      if (cur === want) return st.pf % 2 ? 0 : BTN.A;
      if (st.pf % 6) return 0;
      const [r0, c0, r1, c1] = [Math.floor(cur / 2), cur % 2, Math.floor(want / 2), want % 2];
      return r1 > r0 ? BTN.DOWN : r1 < r0 ? BTN.UP : c1 !== c0 ? BTN.RIGHT : BTN.A;
    }
    if (st.phase === "pre") return mine && st.pf >= 20 + (wait % 30) && st.pf % 2 === 0 ? BTN.A : 0;
    if (st.phase === "kick") { const top = 35 + 70 * Math.floor((st.pf - 12) / 70); return st.kick.t === side && st.kick.power < 0 && st.pf >= 12 && st.pf === Math.max(12, top + kickErr) ? BTN.A : 0; }
    if (st.phase !== "live") return 0;
    const c = carrierOf(st), me = st.ctrl[side] >= 0 ? st.p[st.ctrl[side]] : null;
    if (!me) return 0;
    if (c && c === me) {
      const d = dirOf(side);
      if (c.role === "qb" && st.play.kind === "pass" && !st.play.thrown) {
        if (st.lf === throwAt - 12 && r() < 0.5) {   // look for the open man
          let best = 0, bo = -1;
          ELIGIBLE.forEach((s, i) => { const q = offMan(st, side, s); let open = 99; for (const p of st.p) if (p.t !== side) open = Math.min(open, Math.hypot(p.x - q.x, p.y - q.y)); if (open > bo) { bo = open; best = i; } });
          presses = (best - st.sel[side] + ELIGIBLE.length) % ELIGIBLE.length;
        }
        if (presses > 0 && st.lf % 4 === 0 && st.lf < throwAt) { presses--; return BTN.B; }
        return st.lf === throwAt ? BTN.A : 0;
      }
      if (st.grab && st.grab.g === c.g) { if (st.frame >= mashNext) { mashNext = st.frame + 7 + Math.floor(r() * 4); return BTN.A | (d > 0 ? BTN.RIGHT : BTN.LEFT); } return d > 0 ? BTN.RIGHT : BTN.LEFT; }
      if (st.frame % 8 === 0) {   // a late look at the nearest man in front
        steer = 0; let nd = 6;
        for (const p of st.p) if (p.t !== side && p.down <= 0 && d * (p.x - c.x) > -0.5) { const dd = Math.hypot(p.x - c.x, p.y - c.y); if (dd < nd) { nd = dd; steer = p.y > c.y ? -1 : 1; } }
        if (c.y < 4) steer = 1; if (c.y > 49) steer = -1;
      }
      return (d > 0 ? BTN.RIGHT : BTN.LEFT) | (steer < 0 ? BTN.UP : steer > 0 ? BTN.DOWN : 0);
    }
    if (mine) return 0;   // a teammate has it, or it is in the air: hands off
    // defence: go for the ball a beat late, dive when close now and then
    if (st.frame % 10 === 0) tgt = c ? [c.x, c.y] : st.ball ? [st.ball.x1 ?? st.ball.x, st.ball.y1 ?? st.ball.y] : null;
    if (!tgt) return 0;
    const dx = tgt[0] - me.x, dy = tgt[1] - me.y, dd = Math.hypot(dx, dy);
    if (dd > 18 && st.frame % 60 === 0) return BTN.B;
    if (c && dd < 2 && st.frame % 6 === 0 && r() < 0.25) return BTN.A;
    return (dx > 0.5 ? BTN.RIGHT : dx < -0.5 ? BTN.LEFT : 0) | (dy > 0.5 ? BTN.DOWN : dy < -0.5 ? BTN.UP : 0);
  };
}
void HZ; void O;
