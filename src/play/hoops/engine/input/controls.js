// THE COURTS engine, input/controls.js: the human's hands: the pro stick, moves, passes, shots, defence, free throws.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { markSpot, stealTry } from "../ai/defence.js";
import { runOnto, callPick } from "../ai/offence.js";
import { DT, clamp, C, len, rimOf, distRim } from "../court.js";
import { BTN, dirCode, codeXY } from "./intents.js";
import { startMove } from "../moves.js";
import { passTarget, passTo, OOP_TAP, oopTarget } from "../pass.js";
import { goTo, hop } from "../physics.js";
import { ICONS } from "../players.js";
import { TOP, FT_TOP, HOLD_MAX, release, startShot, ftRelease } from "../shot.js";
import { lv, human, say, markerOf, teamOf, nearestToBall } from "../state.js";

// The pro stick: a gesture from the first push to the return to centre (or 8 frames held):
// one way = a move by direction; three or more ways in a row = a spin; held toward the rim = drive.
export function proStick(st, P, m) {
  const code = dirCode(m);
  const g = st.gest;
  if (code) {
    if (!g) st.gest = { codes: [code], f0: st.frame, fired: false };
    else if (g.codes[g.codes.length - 1] !== code) g.codes.push(code);
    const G2 = st.gest;
    if (!G2.fired && st.frame - G2.f0 >= 8) { G2.fired = true; return resolveGesture(st, P, G2.codes); }
    return null;
  }
  if (g) { st.gest = null; if (!g.fired) return resolveGesture(st, P, g.codes); }
  return null;
}
export function resolveGesture(st, P, codes) {
  const d = P.d;
  if (new Set(codes).size >= 3) return ["spin", codeXY(codes[codes.length - 1])[1] || (P.y < C.cy ? 1 : -1)];
  const [x, y] = codeXY(codes[0]), along = x * d;
  if (y && along < 0) return ["btl", y];
  if (y && along > 0) return ["btb", y];
  if (y) return ["cross", y];
  if (along < 0) return ["stepback", 0];
  return ["drive", 0];
}
export function humanThink(st, P, m, press) {
  const b = st.ball;
  P.vx = 0; P.vy = 0; P.intense = false;
  if (st.phase === "tip") { if (press & (BTN.X | BTN.Y | BTN.A) && st.tipPress < 0 && st.jumpers.includes(P.g)) st.tipPress = st.t; return; }
  if (st.phase === "ft") { ftHuman(st, P, m, press); return; }
  if (st.phase !== "live") return;
  if (P.stumble > 0) return;
  const has = b.st === "held" && b.own === P.g;
  if (!has && press & BTN.A && st.poss !== 0) {
    const N = nearestToBall(st, 0, P.g);
    if (N) { st.ctl = N.i; say(st, "switchman", N); }
    return;
  }
  if (P.act) {
    if (P.act.kind === "jump" && (!(m & BTN.X) || P.act.f >= HOLD_MAX)) release(st, P, P.act.f - TOP);
    if (P.act?.kind === "move" && P.act.f >= 6 && press & BTN.X && P.act.m === "stepback") { P.act = null; P.sb = 30; startShot(st, P); }
    return;
  }
  const dx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0), dy = (m & BTN.UP ? 1 : 0) - (m & BTN.DOWN ? 1 : 0);
  P.sprint = Boolean(m & BTN.RT) && P.sta > 0.05;
  if (has) {
    P.post = Boolean(m & BTN.LT) && distRim(P) < 6.5;
    // a quick reversal of the stick: a dribble move
    const code = dx || dy ? (dx + 1) * 3 + (dy + 1) : 0;
    if (code) {
      if (code !== P.ld) {
        const [px, py] = P.ld ? codeXY(P.ld) : [0, 0];
        const rev = P.ld && px * dx + py * dy < 0 && st.frame - P.ldEnd <= 5 && P.ldEnd - P.ldStart >= 3;
        P.ld = code; P.ldStart = st.frame;
        if (rev && !P.post) {
          const kind = py * dy < 0 ? (len(P.vx, P.vy) > 4.5 || P.burst > 0 ? "btb" : P.S.handle > 0.6 && (st.frame & 3) === 0 ? "btl" : "cross") : "hesi";
          if (startMove(st, P, kind, dy || (P.y < C.cy ? 1 : -1))) { P.ldEnd = st.frame; return; }
        }
      }
      P.ldEnd = st.frame;
    }
    // ICON PASSING: RB held puts a button over each teammate; that button passes to him (a lead pass)
    st.iconOn = Boolean(m & BTN.RB) && st.n > 1;
    if (st.iconOn) {
      st.icons = teamOf(st, P.t).filter(Q => Q !== P).map((Q, k) => ({ g: Q.g, b: ICONS[k] }));
      st.yPend = null;
      for (const ic of st.icons) if (press & BTN[ic.b]) { passTo(st, P, st.p[ic.g], "chest"); say(st, "iconpass", P, { to: ic.g }); return; }
    } else {
      const gst = proStick(st, P, m) || (press & BTN.SPIN ? ["spin", dy || (P.y < C.cy ? 1 : -1)] : null);
      if (gst && !P.post) { if (startMove(st, P, gst[0], gst[1])) return; }
      // Y once: a lob toward the stick (after a beat, in case a second tap is coming); Y twice: the
      // alley-oop to the cutter nearest the rim
      if (st.yPend && st.frame - st.yPend.f > OOP_TAP) { const Q = passTarget(st, P, st.yPend.m); st.yPend = null; if (Q) { passTo(st, P, Q, "lob"); return; } }
      if (press & BTN.X) { st.yPend = null; startShot(st, P, Boolean(m & BTN.RT)); return; }
      if (press & BTN.Y) {
        if (st.yPend) { st.yPend = null; const Q = oopTarget(st, P); if (Q) { passTo(st, P, Q, "lob", true); return; } }
        else { st.yPend = { f: st.frame, m }; const Q = oopTarget(st, P); if (Q && !Q.cut && !human(st, Q)) Q.cut = { x: Q.d * (C.rimX - 1.0), y: C.cy + (Q.y > C.cy ? 0.7 : -0.7), until: st.frame + 75 }; }
      }
      if (press & (BTN.A | BTN.B) && st.n > 1) { st.yPend = null; const Q = passTarget(st, P, m); if (Q) passTo(st, P, Q, press & BTN.B ? "bounce" : "chest"); return; }
      if (press & BTN.LB) callPick(st, P);
    }
  } else { st.gest = null; P.post = false; }
  if (dx || dy) {
    const n = dx && dy ? 0.70710678 : 1;
    let sp = P.spd * (has ? 0.88 : 1) * lv(st).spd * n;
    if (P.post) sp *= 0.4;
    P.vx = dx * sp; P.vy = dy * sp;
  }
  if (has) {
    if (P.post) {
      // backing down: toward the rim, shoulder into the man
      const rx = rimOf(P), r = distRim(P) || 1, D = markerOf(st, P);
      if (D && len(D.x - P.x, D.y - P.y) < 0.9) { const push = 0.35 * clamp(0.5 + (P.h - D.h) * 2 + (P.S.close - D.S.intD) * 0.5, 0.1, 1); D.x += ((rx - P.x) / r) * push * DT * 3; D.y += ((C.cy - P.y) / r) * push * DT * 3; }
      P.face = -P.d;
    }
    return;
  }
  // a pass coming to you: go and meet it unless you steer; on defence the easy assist guards for you
  if (!dx && !dy && b.st === "pass" && b.to === P.g) runOnto(st, P);
  else if (!dx && !dy && lv(st).autoD && st.poss === 1 && b.st === "held") { const [tx, ty] = markSpot(st, P); goTo(P, tx, ty); }
  if (st.poss === 1 || b.st === "loose") {
    P.intense = Boolean(m & BTN.LT) && P.sta > 0.05;
    if (P.intense) { P.vx *= 0.9; P.vy *= 0.9; P.hands = Math.max(P.hands, 2); }
    if (press & BTN.Y) hop(P);
    else if (press & BTN.X && P.cool <= 0) stealTry(st, P);
    else if (press & BTN.B && !dx && !dy) { P.charge = 40; say(st, "takecharge", P); }
    if (P.charge > 0) { P.vx = 0; P.vy = 0; }
  }
}

// ---- the free throw ---------------------------------------------------------------------------------
export function ftHuman(st, P, m, press) {
  const F = st.ft;
  if (!F || F.g !== P.g || st.ball.st !== "held" || F.t < 30) return;
  if (!P.act && press & BTN.X) P.act = { kind: "ftshot", f: 0 };
  else if (P.act?.kind === "ftshot" && !(m & BTN.X)) ftRelease(st, P, P.act.f - FT_TOP);
}
