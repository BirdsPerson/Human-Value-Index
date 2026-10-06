// A CASUAL HUMAN, as a bot (scripts/check-skate.mjs): it skates the park the way someone who has just picked the
// game up does. Every decision lands a random number of ticks late or early (button timing noise: up to
// +-6 ticks = +-100 ms), it reads the balance needle 10 ticks late (a reaction time), it taps a flip or holds a
// grab at some point in the air, it spins a half turn now and then, it mostly rides the ramps, and it only
// rarely tries a manual or a revert. It reads the sim's state the way a player reads the screen, and it makes
// the sim's one input word each tick. Deterministic from its seed (its own generator, not the sim's).
import * as S from "../src/play/skate/sim.js";
const B = S.BIT;

export function casual(seed, { level = "park", spinP = 0.15, manualP = 0.08, revertP = 0.12, noise = 6, trickP = 0.9 } = {}) {
  let r = (seed >>> 0) || 1;
  const R = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
  const jit = (n = noise) => Math.round((R() * 2 - 1) * n);       // +-n ticks
  const between = (a, b) => a + Math.floor(R() * (b - a + 1));
  const L = S.levelOf(level);
  // where it rides: the longest quarter pipes' walls; after a landing it rolls out to the flat, turns, and goes back at one
  const qps = L.objs.filter(o => o.k === "qp"), span = (o) => (o.f.ax === "y" ? o.x1 - o.x0 : o.y1 - o.y0);
  const top = Math.max(...qps.map(span));
  const walls = qps.filter(o => span(o) >= top * 0.95);
  const lipPt = (o, out = 0) => (o.f.ax === "y" ? { x: (o.x0 + o.x1) / 2, y: o.f.lip - o.f.sgn * out } : { x: o.f.lip - o.f.sgn * out, y: (o.y0 + o.y1) / 2 });
  const m = { air: null, crouch: 0, ollieIn: 0, manual: null, hist: [], turn: 0, pendSeen: 0, lastSt: "ground", revertAt: -1, outT: 0 };
  const bot = (st) => {
    let w = 0;
    const t = st.t;
    // the needle, as seen 10 ticks ago
    const seen = (o) => { m.hist.push(o ? o.b : 0); if (m.hist.length > 11) m.hist.shift(); return m.hist[0]; };
    const hold = (b) => (b > 0.06 ? -1 : b < -0.06 ? 1 : 0);
    if (st.st === "air") {
      if (m.lastSt !== "air") {   // takeoff: plan the air
        const vert = st.vert >= 0, tm = vert ? 2.2 : 1;
        m.air = { t0: t, ops: [], R: R() };
        const k = R(), o = m.air.ops;
        if (R() < trickP) {
          if (k < 0.45) { const a = Math.max(0, Math.round(5 * tm) + jit() + (vert ? 8 : 0)); const dir = R() < 0.7 ? B.left : R() < 0.5 ? B.right : B.down; o.push([a, a + between(4, 8), B.x | dir]); }
          else { const a = Math.max(0, Math.round(5 * tm) + jit() + (vert ? 8 : 0)); const dir = [B.up, B.down, B.left, B.right, 0][between(0, 4)]; const len = between(10, 26); o.push([a, a + len, B.b | dir]); }
          if (vert && R() < 0.6) { const a = between(34, 50) + jit(); o.push([a, a + between(4, 8), B.x | B.left]); }
        }
        if (R() < spinP) { const a = Math.max(0, 2 + jit(2)), len = Math.round(14 + jit()); o.push([a, a + len, R() < 0.5 ? B.sl : B.sr]); }
        m.air.land = null;
        if (R() < revertP) m.revertAt = -2;   // decided at landing
      }
      const A = m.air, e = t - A.t0;
      for (const [a, b, bits] of A.ops) if (e >= a && e < b) w |= bits;
      // a grab or a flip held on past the landing is what a human does when they look away: the bot lets go when it is low
      if (st.vz < 0 && st.z < (S.levelOf(level).objs[st.vert]?.H || 0) + 0.15 && (w & B.b) && R() < 0.3) w &= ~B.b;
      // the revert is pressed as it lands (pre-press) on a ramp
      if (st.vert >= 0 && m.revertAt === -2 && st.vz < 0 && st.z < (L.objs[st.vert]?.H || 1.6) * 0.4 + jit(1) * 0.05) w |= B.r;
      m.lastSt = "air"; m.crouch = 0;
      return w;
    }
    if (st.st === "bail") { m.lastSt = "bail"; m.manual = null; return 0; }
    if (st.st === "manual") {
      const o = st.m, b = seen(o);
      if (!m.manual) m.manual = { n: 0, len: between(40, 90), out: 0, at: 0, started: true };
      m.manual.n++;
      m.lastSt = "manual";
      if (m.manual.n > m.manual.len) { if (!m.manual.out) { m.manual.out = 1; return B.a; } return 0; }
      return hold(b) < 0 ? B.up : hold(b) > 0 ? B.down : 0;
    }
    if (st.st === "grind" || st.st === "lip") { m.lastSt = st.st; const o = st.st === "grind" ? st.g : st.lip; const b = seen(o); return (hold(b) < 0 ? B.left : hold(b) > 0 ? B.right : 0) | (R() < 0.02 ? B.a : 0); }
    // on the ground
    const was = m.lastSt; m.lastSt = "ground";
    if (was === "air" && st.combo && R() < manualP) m.manual = { n: 0, len: between(40, 90), out: 0, at: t + between(2, 10), nose: R() < 0.2 };
    if (st.combo && st.pend > 0 && m.manual && !m.manual.started && t >= m.manual.at) {   // up, down
      const e = t - m.manual.at;
      if (e < 3) return B.up;
      m.manual.started = true; return B.down;
    }
    if (m.manual && m.manual.started && st.st !== "manual" && !st.combo) m.manual = null;
    if (m.manual && m.manual.started && st.st === "ground" && st.pend <= 0) m.manual = null;
    // the ollie: hold to crouch, let go (at a kicker's lip, rarely; mostly on flat or just riding the ramps)
    if (m.crouch > 0) { m.crouch--; if (m.crouch === 0) return 0; return B.a | B.up; }
    // steer: out to the flat after a landing, then back at the farthest wall
    const far = walls.reduce((bw, o) => { const p = lipPt(o), d = (p.x - st.x) ** 2 + (p.y - st.y) ** 2; return !bw || d > bw.d ? { o, d } : bw; }, null);
    const onRamp = st.o >= 0 && L.objs[st.o].k === "qp";
    const nearest = walls.reduce((bw, o) => { const p = lipPt(o), d = (p.x - st.x) ** 2 + (p.y - st.y) ** 2; return !bw || d < bw.d ? { o, d } : bw; }, null);
    if (was === "air" || onRamp) { if (onRamp) m.outT = 1; }
    if (m.outT > 0) { m.outT++; if (!onRamp && (Math.sqrt(nearest.d) > 9 || m.outT > 700)) m.outT = 0; }
    const aim = m.outT > 0 ? lipPt(nearest.o, 10) : lipPt(far.o);
    const [hx, hy] = S.headVec(st.h);
    const dx = aim.x - st.x, dy = aim.y - st.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const dot = (hx * dx + hy * dy) / d, cr = (hx * dy - hy * dx) / d;
    let o = 0;
    const slack = 0.18 + R() * 0.1;
    if (dot < 0.97 && Math.abs(cr) > 0.05) o |= cr > 0 ? B.right : B.left;
    if (dot > 0.35) o |= B.up;
    // a human taps a bit of ollie on the way now and then
    if (!st.combo && st.o < 0 && R() < 0.004 && dot > 0.7) m.crouch = between(5, 14) + 1;
    void slack;
    return o;
  };
  return bot;
}
