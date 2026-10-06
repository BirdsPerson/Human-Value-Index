// THE BOWL: a casual human, as a script, for scripts/check-football.mjs (and the tuning of ROOKIE).
// Not a good player: reads the card for a second and a half and takes ASK THE COORDINATOR every down,
// snaps late, reads the field about a quarter-second behind and throws to the man who looked open then
// (and sometimes to the wrong button), holds the ball too long now and then, runs straight at the
// goal on SPRINT, tries a move only now and then, times the kick meter roughly, and on defence mostly
// lets the CPU move his man (a tackle button now and then).
import { BTN, CODE, CALL_SHIFT, ICONS, OS, toGoal } from "../src/play/football/sim.js";

export function casualHuman(seed = 1) {
  let h = (seed * 2654435761) >>> 0 || 1;
  const r = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  let lastCall = -999, wait = 0, phase = "", ph = -1, throwAt = 0, pick = null, pressUntil = 0, seenOpen = null, kickErr = 0;
  return (st) => {
    if (st.phase === "call" && st.need === 0) {
      if (ph !== st.playNo + 1000 * st.q || phase !== "call") { ph = st.playNo + 1000 * st.q; phase = "call"; wait = st.frame + 70 + Math.floor(r() * 60); }
      if (st.frame < wait || st.frame - lastCall < 20) return 0;
      lastCall = st.frame;
      return (st.tryChoice ? CODE.PAT : CODE.COACH) << CALL_SHIFT;
    }
    if (st.phase !== phase) { phase = st.phase; wait = 30 + Math.floor(r() * 60); throwAt = 75 + Math.floor(r() * 70); pick = null; seenOpen = null; kickErr = (r() - 0.5) * 0.12; }
    const k = st.kick;
    if (k && k.by === 0 && !k.done) {
      if (k.stage === 0) return st.pt > 25 && st.pt % 2 === 0 ? BTN.A : 0;
      if (k.stage === 1) return k.f === 38 + Math.floor(kickErr * 40) + 4 ? BTN.A : 0;
      if (k.stage === 2) return k.pow - k.f / 40 < kickErr * 2 + 0.03 ? BTN.A : 0;
      return 0;
    }
    if (st.phase === "pre" && st.poss === 0) return st.pt > wait + 20 && st.pt % 2 === 0 ? BTN.A : 0;
    if (st.phase !== "live") return 0;
    const P = st.p[st.ctl];
    if (!P) return 0;
    if (st.ball.st === "held" && st.ball.own === P.g && P.role.k === "qb" && st.play.kind === "pass" && !st.cur.thrown) {
      // a read every 15 frames (a quarter second late): the man with the most room then
      if (st.pt % 15 === 0 && st.pt >= 45) {
        let best = null, bo = -1;
        for (const [, slot, bit] of ICONS) {
          const Rr = st.p[st.off[0][slot]];
          if (Rr.role.k !== "route") continue;
          let open = 99; for (const D of st.p) if (D.t === 1) open = Math.min(open, Math.hypot(D.x - Rr.x, D.y - Rr.y));
          const score = open + (Rr.x - P.x) * 0.08 + (r() - 0.5) * 3.5;
          if (score > bo) { bo = score; best = bit; }
        }
        seenOpen = best;
      }
      if (st.pt >= throwAt && seenOpen) {
        if (!pick) { pick = r() < 0.12 ? ICONS[Math.floor(r() * ICONS.length)][2] : seenOpen; pressUntil = st.pt + 4; }
        return st.pt < pressUntil ? pick : 0;
      }
      return 0;
    }
    if (st.ball.st === "held" && st.ball.own === P.g) {
      const mv = st.pt % 90 === 40 && r() < 0.35 ? BTN.X : 0;
      return BTN.UP | BTN.SPRINT | mv;
    }
    // defence: the CPU runs his man; now and then he taps tackle
    if (st.ball.st === "held" && st.p[st.ball.own].t === 1 && st.pt % 45 === 0 && r() < 0.5) return BTN.A;
    return 0;
  };
}
export const EQUAL = (p, r) => Array.from({ length: 11 }, (_, i) => [`${p}${i}`, `${p.toUpperCase()} ${i}`, r - i]);
