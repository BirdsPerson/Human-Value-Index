// THE COURTS engine, physics.js: motion: the ball's flight, a man going to a spot, the hop, the loose ball and the pass in the air, contact on the drive.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { HZ, DT, G, C, len, TOP_SPOT, distRim, inBounds } from "./court.js";
import { step } from "./game.js";
import { giveBall, dead, foulCall, toLine, turnover, scored, endPeriod } from "./rules/index.js";
import { PASS_MAX, blocked } from "./shot.js";
import { rnd, lv, you, holder, say } from "./state.js";

// ---- the ball's flight ---------------------------------------------------------------------------
export function aim(b, tx, ty, tz, T) {
  const s = T / HZ;
  b.vx = (tx - b.x) / s; b.vy = (ty - b.y) / s; b.vz = (tz - b.z) / s + (G * s) / 2;
}
export function flight(b) { b.vz -= G * DT; b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT; }

// ---- moving -------------------------------------------------------------------------------------
export function goTo(P, tx, ty, frac = 1) {
  const dx = tx - P.x, dy = ty - P.y, d = len(dx, dy), step = P.spd * DT * frac;
  if (d < 0.05) { P.vx = 0; P.vy = 0; return; }
  const k = Math.min(1, step / d);
  P.vx = (dx * k) / DT; P.vy = (dy * k) / DT;
}
export function hop(P) { if (P.z > 0 || P.stumble > 0) return; P.vz = Math.sqrt(2 * G * P.leap); P.z = 0.0001; P.act = { kind: "hop", f: 0 }; }

export function ballStep(st) {
  const b = st.ball;
  b.f++;
  if (b.st === "tip") {
    if (st.t >= 30) { if (st.t === 30) b.vz = 6.2; flight(b); }
    return;
  }
  if (b.st === "held") {
    const H = st.p[b.own];
    if (H.act?.kind !== "dunk") { b.x = H.x + H.face * 0.32; b.y = H.y - 0.05; b.z = H.act?.kind === "jump" ? H.z + H.h + 0.15 : 0.95; }
    return;
  }
  if (b.st === "pass") {
    flight(b);
    // the bounce: off the floor, up into his hands
    if (b.pass === "bounce" && b.leg === 1 && (b.z <= 0 || b.f >= b.T1)) { b.z = Math.max(0.02, b.z); b.leg = 2; aim(b, b.tx, b.ty, b.tz, Math.max(2, b.T - b.f)); st.ev.push("bounce"); }
    const from = st.p[b.from];
    // a defender in the lane gets one go at it: a deflection (loose) or a steal; a bounce pass is
    // harder to get a hand on, a lob only by a tall man in the air
    for (const O of st.p) {
      if (O.t === from.t || O.stumble > 0 || b.tried & (1 << O.g)) continue;
      const reach = b.pass === "lob" ? O.z + O.h + 0.4 : 2.3 + O.z, k = len(O.x - b.x, O.y - b.y), arm = 0.5 + 0.2 * O.S.steal;
      if (k > arm || b.z > reach || b.f < 4) continue;
      b.tried |= 1 << O.g;
      const p = (0.12 + 0.24 * O.S.steal) * (1 - 0.5 * k / arm) * (b.pass === "bounce" ? 0.6 : b.pass === "lob" ? 0.7 : 1) * (you(st, from.t) ? lv(st).cpuSteal : 1);
      if (rnd(st) >= p) continue;
      st.tov[from.t]++;
      if (rnd(st) < 0.4 + 0.35 * O.S.steal) { giveBall(st, O); say(st, "intercept", O); return; }
      Object.assign(b, { st: "loose", own: -1, f: 0, rim: false, alley: false, vx: b.vx * -0.25 + (rnd(st) - 0.5) * 4, vy: b.vy * -0.25 + (rnd(st) - 0.5) * 4, vz: 1 + rnd(st) * 1.5 });
      st.lastTouch = O.t; say(st, "deflect", O);
      return;
    }
    for (const Q of st.p) {
      if (Q.t !== from.t || Q.g === b.from) continue;
      const tgt = Q.g === b.to, k = len(Q.x - b.x, Q.y - b.y);
      const radius = tgt ? (b.alley ? 1.1 : b.f >= b.T - 1 ? 0.95 : 0.5) : 0.4;
      if (k < radius && b.z < (b.alley ? 3.9 : 2.6) + Q.z && (!b.alley || b.f >= b.T - 6) && (b.pass !== "bounce" || b.leg === 2)) {
        const alley = b.alley && tgt && b.z > 2.2;
        if (tgt) st.lastCatch = { g: Q.g, d: k, miss: len(Q.x - b.tx, Q.y - b.ty), v: len(Q.ax || 0, Q.ay || 0), f: b.f, T: b.T, kind: b.pass, frame: st.frame };
        giveBall(st, Q);
        if (alley) { Q.act = { kind: "dunk", f: 6, x0: Q.x, y0: Q.y }; Q.cut = null; say(st, "alleyoop", Q, { from: from.g }); }
        return;
      }
    }
    if ((b.z <= 0 && (b.pass !== "bounce" || b.leg === 2)) || b.f > PASS_MAX) { if (b.alley) st.tov[from.t]++; loose(st); }
    return;
  }
  if (b.st === "shot") {
    if (b.kind !== "dunk" && b.f < 22) {
      const S = st.p[b.from];
      for (const D of st.p) {
        if (D.t === S.t || D.z < 0.15 || D.act?.blockTried) continue;
        if (len(D.x - b.x, D.y - b.y) < 0.75 && b.z < D.z + D.h + 0.7) {
          if (D.act) D.act.blockTried = true;
          if (rnd(st) < (0.05 + 0.2 * D.S.block + (b.kind === "jump" ? 0 : 0.04)) * (you(st, S.t) ? lv(st).cpuBlock : 1)) { blocked(st, D, S); return; }
        }
      }
    }
    flight(b);
    if (b.f >= b.T) {
      const S = st.p[b.from];
      if (b.made) {
        const d = S.d;
        Object.assign(b, { x: d * C.rimX, y: C.cy, z: C.rimZ, vx: 0, vy: 0, vz: -1.5 });
        scored(st, S, b.pts);
        if (b.kind !== "dunk") st.ev.push("swish");
        return;
      }
      S.streak = Math.min(0, S.streak) - 1; if (S.streak <= -2) S.hot = false;
      if (b.fouled) { const n = b.pts; b.fouled = null; b.st = "dead"; say(st, "miss", S); if (st.half) dead(st, 70, "inbound", S.t, TOP_SPOT); else toLine(st, S, n, 70); return; }
      if (b.air) { say(st, "airball", S); b.st = "loose"; return; }
      const d = S.d;
      b.vx = -d * (1.2 + rnd(st) * 2.6); b.vy = (rnd(st) - 0.5) * 5; b.vz = 2.0 + rnd(st) * 2.4;
      b.st = "loose"; b.rim = true; st.shot = st.cfg.shot * HZ;
      say(st, b.kind === "dunk" ? "rimout" : "miss", S);
      if (st.buzzer) { endPeriod(st); }
    }
    return;
  }
  if (b.st === "loose") {
    const wasUp = b.z > 0.01;
    flight(b);
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -0.8) { b.vz = -b.vz * 0.6; b.vx *= 0.85; b.vy *= 0.85; if (wasUp) st.ev.push("bounce"); } else { b.vz = 0; b.vx *= 0.96; b.vy *= 0.96; }
      if (st.phase === "live" && !inBounds(st, b.x, b.y)) { turnover(st, "oob", null, b.x, b.y); return; }
    }
    if (st.phase !== "live") return;
    // the nearest hand within reach takes it; inside position (the defence of a missed shot) and
    // height count for something
    let best = null, bd = 1e9, rival = null;
    for (const P of st.p) {
      if (P.act?.kind === "jump" || P.act?.kind === "dunk" || P.stumble > 0) continue;
      const k = len(P.x - b.x, P.y - b.y);
      const ext = you(st, P.t) ? lv(st).reb?.[st.n] || 0 : 0;   // the level's long arms for your side on the glass
      if (k > 0.85 + ext || b.z >= P.z + P.h + 0.45 + ext * 0.5) continue;
      const sc = k - ext - (b.rim && P.t !== st.poss ? 0.45 : 0) - 0.4 * (P.h - 2);
      if (sc < bd) { bd = sc; best = P; }
    }
    if (best) {
      for (const P of st.p) if (P.t !== best.t && len(P.x - b.x, P.y - b.y) < 0.65 && b.z < 1.2) rival = P;
      // the scramble on the floor: now and then the loser fouls the winner
      if (rival && rnd(st) < 0.05) { const off = st.poss === best.t; giveBall(st, best); say(st, off ? "oreb" : "dreb", best); foulCall(st, rival, best, "loose"); return; }
      const off = st.poss === best.t, bf = b.f, wasShot = b.rim || b.air;
      giveBall(st, best);
      say(st, bf > 2 && wasShot ? (off ? "oreb" : "dreb") : "loosegrab", best);
      if (st.buzzer) endPeriod(st);
    }
    if (b.f > 600) turnover(st, "oob", null, b.x, b.y);
  }
  if (b.st === "through") { flight(b); if (b.z < 0) { b.z = 0; b.vz = 0; } }
}
export function loose(st) {
  const b = st.ball;
  b.st = "loose"; b.f = 0; b.own = -1; b.alley = false;
}

// Contact on the drive: the ball handler running into a defender in front of him. A defender set
// (still, feet outside the restricted arc) draws the charge; one sliding into the path is a block.
export function contact(st) {
  const H = holder(st);
  if (!H || H.act || H.z > 0) return;
  const v = len(H.vx, H.vy) * (H.burst > 0 ? 1.22 : 1) * (H.sprint ? 1.2 : 1);
  if (v < 4.2) return;
  for (const D of st.p) {
    if (D.t === H.t || D.z > 0 || D.stumble > 0 || D.cool > 30) continue;
    const ox = D.x - H.x, oy = D.y - H.y, d = len(ox, oy);
    if (d > 0.62 || (ox * H.vx + oy * H.vy) / (d * v || 1) < 0.65) continue;
    if (st.frame - (H.lastContact || -99) < 45) return;
    H.lastContact = st.frame;
    const ra = distRim(D, H) < C.ra, set = D.still >= 12 || D.charge > 0 && D.still >= 4;
    const u = rnd(st);
    if (set && !ra) { if (u < (D.charge > 0 ? 0.75 : 0.25)) { foulCall(st, H, D, "charge"); return; } }
    else if (!set) { if (u < 0.2 * (1.2 - D.S.perD * 0.6) * (you(st, D.t) ? lv(st).foul : 1)) { foulCall(st, D, H, "block"); return; } }
    // no call: the drive is stopped dead
    H.vx *= 0.2; H.vy *= 0.2; H.burst = 0;
    return;
  }
}
