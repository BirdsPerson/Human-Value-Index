// THE COURTS engine, shot.js: the shot: the meter, the green band, the contest, the make chance, the release, the dunk, blocks and strips, the free throw's release.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { HZ, G, clamp, C, len, isThree, rimOf } from "./court.js";
import { NEUTRAL } from "./levels.js";
import { aim } from "./physics.js";
import { foulCall, noClear, longPts } from "./rules/index.js";
import { rnd, gauss, lv, you, human, say } from "./state.js";

export const TOP = 20;            // frames from the gather to the top of the jump: the release to aim for
export const FT_TOP = 24;         // the free throw's set shot: frames from the dip to the release
export const LAND = 2 * TOP;
export const PASS_MAX = 120, HOLD_MAX = LAND - 2;
// ---- the shot: quality = f(rating for the shot, distance, contest, timing, fatigue, type) --------
export const GRADES = ["GREEN", "SLIGHTLY EARLY", "SLIGHTLY LATE", "EARLY", "LATE", "VERY EARLY", "VERY LATE"];
// The green band (frames either side of the top): wider for a better shooter, wider (or narrower)
// by the level's `green` for you (extra).
export function greenOf(P, kind, extra = 0) {
  const s = kind === "ft" ? P.S.ft : kind === "lay" || kind === "float" || kind === "hook" ? P.S.close : P.S.mid > P.S.three ? (P.S.mid + P.S.three) / 2 : P.S.three;
  return Math.max(1, 2 + Math.round(2 * s) + (extra | 0));
}
export function gradeOf(e, w) {
  const a = e < 0 ? -e : e;
  if (a <= w) return "GREEN";
  if (a <= w + 3) return e < 0 ? "SLIGHTLY EARLY" : "SLIGHTLY LATE";
  if (a <= w + 8) return e < 0 ? "EARLY" : "LATE";
  return e < 0 ? "VERY EARLY" : "VERY LATE";
}
export const TIMING = { GREEN: 1.38, "SLIGHTLY EARLY": 0.9, "SLIGHTLY LATE": 0.9, EARLY: 0.64, LATE: 0.64, "VERY EARLY": 0.3, "VERY LATE": 0.3 };
// How contested a shooter at (x, y) is: 0 (alone) .. 1 (smothered), from the nearest defenders'
// distance, whether they are between him and the rim, their height, their hands, their defence.
export function contestOf(st, S, x = S.x, y = S.y) {
  const rx = rimOf(S), r = len(rx - x, C.cy - y) || 1, ux = (rx - x) / r, uy = (C.cy - y) / r;
  let c = 0, who = null;
  for (const D of st.p) {
    if (D.t === S.t) continue;
    const dx = D.x - x, dy = D.y - y, d = len(dx, dy);
    if (d > 2.4) continue;
    const front = (dx * ux + dy * uy) / (d || 1);
    const clos = clamp((2.4 - d) / 2.0, 0, 1), fr = clamp((front + 0.4) / 1.2, 0, 1);
    const dskill = r < 3 ? (D.S.intD + D.S.block) / 2 : D.S.perD;
    let v = clos * (0.3 + 0.7 * fr) * (0.6 + 0.3 * dskill) * clamp(1 + 0.6 * (D.h - S.h), 0.7, 1.3) * (D.z > 0.1 ? 1.3 : D.hands > 0 ? 1.1 : 0.8);
    if (D.stumble > 0) v *= 0.1;
    if (D.screened > 0) v *= 0.6;
    if (you(st, D.t) && st.lv) v *= st.lv.mateD;
    if (v > c) { c = v; who = D; }
  }
  return { c: clamp(c, 0, 1), D: who };
}
export const CONTEST_WORDS = ["WIDE OPEN", "OPEN", "LIGHTLY CONTESTED", "CONTESTED", "HEAVILY CONTESTED", "SMOTHERED"];
export const contestWord = (c) => CONTEST_WORDS[c < 0.12 ? 0 : c < 0.28 ? 1 : c < 0.46 ? 2 : c < 0.66 ? 3 : c < 0.86 ? 4 : 5];
export function kindAt(r, post = false) { return r < 1.8 ? "lay" : r < 3.4 ? (post ? "hook" : "float") : "jump"; }
// o: {kind, r, grade, c, three, cs (catch and shoot), od (off a dribble move), sb (stepback),
// fade, moving}. -> the chance it goes in.
export function shotProb(st, P, o) {
  const { kind, r } = o, S = P.S;
  let base;
  if (kind === "lay") base = 0.8 + 0.2 * S.close - 0.04 * r;
  else if (kind === "float") base = 0.36 + 0.3 * (S.close * 0.6 + S.mid * 0.4) - 0.03 * (r - 1.8);
  else if (kind === "hook") base = 0.42 + 0.32 * S.close - 0.03 * (r - 1.8);
  else if (r > 11.5) base = 0.02;
  else if (o.three) base = 0.31 + 0.4 * S.three - 0.045 * Math.max(0, r - 7.24) - 0.07 * Math.max(0, r - 8.6);
  else base = 0.34 + 0.33 * S.mid - 0.012 * Math.max(0, r - 3.4);
  let tm = TIMING[o.grade] ?? 0.9;
  if (kind === "lay") tm = 1 + (tm - 1) * 0.5;
  const green = o.grade === "GREEN";
  const L = st.lv || NEUTRAL, mine = you(st, P.t);
  const cm = 1 - (green ? 0.6 : kind === "lay" ? 0.45 : 0.75) * o.c * (mine ? L.contest : 1);
  let p = base * tm * cm;
  if (o.cs) p *= 1.04;
  if (o.od) p *= 0.96;
  if (o.sb) p *= 0.95;
  if (o.fade) p *= 0.9;
  if (o.moving) p *= 0.93;
  if (P.sta < 0.5) p *= 0.85 + 0.3 * P.sta;
  if (P.hot) p *= 1.06;
  // the half court's own ease (a level's street dials: one on one and three on three are harder on a
  // casual player than five on five, where teammates carry some of it)
  const SM = (st.half && L.street && L.street[st.n]) || null;
  p *= mine ? L.make * (SM ? SM.make : 1) : st.cfg.auto ? 1 : L.cpuMake * (SM ? SM.cpuMake : 1);
  return clamp(p, 0.01, green && o.c < 0.3 ? 0.95 : 0.92);
}
// The chance of a free throw.
export function ftProb(st, P, grade) {
  const tm = { GREEN: 1.1, "SLIGHTLY EARLY": 0.92, "SLIGHTLY LATE": 0.92, EARLY: 0.7, LATE: 0.7, "VERY EARLY": 0.35, "VERY LATE": 0.35 }[grade] ?? 0.9;
  let p = (0.55 + 0.34 * P.S.ft) * tm;
  if (you(st, P.t)) p *= (st.lv || NEUTRAL).ft;
  return clamp(p, 0.05, 0.98);
}

export function release(st, P, e) {
  const b = st.ball, d = P.d, rx = d * C.rimX;
  if (b.st !== "held" || b.own !== P.g) { P.act = null; return; }
  const r = len(rx - P.x, C.cy - P.y), kind = kindAt(r, P.act?.post);
  if (st.half && st.clear === P.t) { P.act = { kind: "follow", f: 0 }; noClear(st, P); return; }
  const three = isThree(P.x, P.y, d), pts = st.half ? (three ? 2 : 1) : three ? 3 : 2;
  const grade = gradeOf(e, greenOf(P, kind, human(st, P) ? lv(st).green : 0));
  const { c, D } = contestOf(st, P);
  const a = P.act || {};
  const o = { kind, r, grade, c, three, cs: st.frame - P.caught < 50 && st.frame - P.lastMove > 60, od: st.frame - P.lastMove < 40, sb: P.sb > 0, fade: a.fade, moving: a.moving };
  let p = shotProb(st, P, o);
  // a shooting foul: a defender on top of the shot, more when he left his feet into it
  let fouled = null;
  if (D) {
    const dd = len(D.x - P.x, D.y - P.y);
    if (dd < 1.05) {
      let pf = (D.z > 0.1 ? 0.1 : 0.025) + (kind === "jump" ? 0 : 0.07) + 0.08 * (1 - D.def) + (D.intense ? 0.02 : 0);
      if (o.three) pf *= 0.6;
      if (you(st, D.t)) pf *= lv(st).foul;
      if (rnd(st) < pf) { fouled = { g: D.g }; p *= 0.5; }
    }
  }
  const made = rnd(st) < p;
  const air = !made && kind === "jump" && r > 4 && (grade.startsWith("VERY") || c > 0.8) && rnd(st) < 0.5;
  Object.assign(b, { st: "shot", own: -1, from: P.g, f: 0, made, pts, kind, rim: false, air, sx: P.x, sy: P.y, x: P.x + d * 0.2, y: P.y, z: P.z + P.h + 0.25, fouled });
  const T = Math.round(kind === "lay" ? 24 : kind === "float" || kind === "hook" ? 30 : 30 + r * 3.0);
  b.T = T;
  let tx = rx, ty = C.cy, tz = C.rimZ + 0.05;
  if (!made && air) { const k = (r - 1.6) / r; tx = P.x + (rx - P.x) * k; ty = P.y + (C.cy - P.y) * k; tz = C.rimZ - 0.5; }
  else if (!made) { tx = rx + d * (rnd(st) < 0.5 ? -0.26 : 0.27); ty = C.cy + (rnd(st) - 0.5) * 0.44; }
  aim(b, tx, ty, tz, T);
  if (!fouled) countFga(st, P, pts, r);
  P.act = { kind: "follow", f: 0 };
  P.sb = 0;
  st.lastTouch = P.t;
  st.lastRel = { g: P.g, e, grade, c, word: contestWord(c), p, frame: st.frame };
  const vsYou = you(st, P.t), bk = vsYou ? lv(st).cpuBlock : 1, rx2 = vsYou ? lv(st).react : 0;
  for (const Q of st.p) if (Q.t !== P.t && !human(st, Q) && Q.z === 0 && len(Q.x - P.x, Q.y - P.y) < 2.4 && rnd(st) < (0.2 + 0.4 * Q.S.block) * bk) Q.jumpAt = st.frame + Math.max(1, Math.round(2 + (1 - Q.k) * 7) + rx2);
  say(st, three ? "shoot3" : "shoot", P, { grade, c });
  if (fouled) foulCall(st, st.p[fouled.g], P, "shooting");
}
export function countFga(st, P, pts, r) {
  st.fga[P.t]++; if (pts === longPts(st)) st.tpa[P.t]++; if (r < 1.9) st.rima[P.t]++;
  st.ball.cnt = { pts, rim: r < 1.9 };
}

// Near the rim: a dunk for a dunker with a lane (or going hard, RT), else a layup (the jump, timed).
export function laneToRim(st, P) {
  const rx = rimOf(P), ax = rx - P.x, ay = C.cy - P.y, L2 = ax * ax + ay * ay || 1;
  for (const D of st.p) {
    if (D.t === P.t || D.stumble > 0) continue;
    const u = clamp(((D.x - P.x) * ax + (D.y - P.y) * ay) / L2, 0, 1.15), px = P.x + ax * u - D.x, py = P.y + ay * u - D.y;
    if (px * px + py * py < 0.75 * 0.75 && u > 0.05) return false;
  }
  return true;
}
export function startShot(st, P, hard = false) {
  const d = P.d, r = len(d * C.rimX - P.x, C.cy - P.y);
  P.face = d;
  if (P.dunker && r < 2.9 && !P.post && (laneToRim(st, P) || hard)) {
    P.act = { kind: "dunk", f: 0, x0: P.x, y0: P.y };
    const vsYou = you(st, P.t), bk = vsYou ? lv(st).cpuBlock : 1, rx2 = vsYou ? lv(st).react : 0;
    for (const Q of st.p) if (Q.t !== P.t && !human(st, Q) && Q.z === 0 && len(Q.x - P.x, Q.y - P.y) < 2.8 && rnd(st) < (0.3 + 0.5 * Q.S.block) * bk) Q.jumpAt = st.frame + Math.max(1, Math.round(2 + (1 - Q.k) * 6) + rx2);
    say(st, "gather", P); return;
  }
  const kind = kindAt(r, P.post), sp = len(P.vx, P.vy);
  const fade = sp > 1 && (P.vx * (d * C.rimX - P.x) + P.vy * (C.cy - P.y)) / (sp * (r || 1)) < -0.4;
  let rel = -1;
  if (!human(st, P)) {
    const s = kind === "jump" ? (isThree(P.x, P.y, d) ? P.S.three : P.S.mid) : P.S.close;
    rel = clamp(Math.round(TOP + gauss(st) * (5.5 + 6 * (1 - s))), 4, HOLD_MAX);
  }
  P.act = { kind: "jump", f: 0, rel, fade, moving: sp > 3.2 && kind === "jump", post: P.post };
  P.vz = (G * TOP) / HZ; P.z = 0.0001;
  for (const Q of st.p) if (Q.t !== P.t && len(Q.x - P.x, Q.y - P.y) < 2.6) Q.hands = 40;
}
export function dunkStep(st, P) {
  const a = P.act, d = P.d, tx = d * (C.rimX - 0.45), ty = C.cy, b = st.ball;
  a.f++;
  const k = Math.min(1, a.f / 16);
  P.x = a.x0 + (tx - a.x0) * k; P.y = a.y0 + (ty - a.y0) * k;
  P.z = a.f <= 16 ? 1.05 * (1 - (1 - k) * (1 - k)) : a.f <= 26 ? 1.05 : Math.max(0, 1.05 - (a.f - 26) * 0.09);
  if (b.st === "held" && b.own === P.g) { b.x = P.x + d * 0.3; b.y = P.y; b.z = P.z + P.h + 0.3; }
  if (a.f === 12 && b.own === P.g) {
    // the rim protector: the nearest defender at the rim decides it, block, foul, strip or nothing
    let D = null, dd = 1.4;
    for (const Q of st.p) { if (Q.t === P.t || Q.stumble > 0) continue; const k2 = len(Q.x - P.x, Q.y - P.y); if (k2 < dd) { dd = k2; D = Q; } }
    a.contested = Boolean(D);
    if (D) {
      const up = D.z > 0.15;
      const pBlock = (up ? clamp(0.05 + 0.25 * D.S.block + 0.4 * (D.h - P.h) - 0.2 * P.S.dunk, 0.03, 0.35) : 0.03) * (you(st, P.t) ? lv(st).cpuBlock : 1);
      const pFoul = up ? 0.2 : 0.14, pStrip = 0.04 + 0.08 * (1 - P.S.handle);
      const u = rnd(st);
      if (u < pBlock) { blocked(st, D, P); a.blocked = true; return; }
      if (u < pBlock + pFoul) a.fouled = D.g;
      else if (u < pBlock + pFoul + pStrip) { stripped(st, D, P); a.blocked = true; return; }
    }
  }
  if (a.f === 12 && st.half && st.clear === P.t && b.own === P.g) { noClear(st, P); a.blocked = true; return; }
  if (a.f === 16 && !a.blocked && b.own === P.g) {
    const p = a.fouled != null ? 0.45 + 0.35 * P.S.dunk : a.contested ? 0.72 + 0.15 * P.S.dunk : 0.95 + 0.04 * P.S.dunk;
    st.lastTouch = P.t;
    const fouled = a.fouled != null ? { g: a.fouled } : null;
    Object.assign(b, { st: "shot", own: -1, from: P.g, f: 0, kind: "dunk", pts: st.half ? 1 : 2, made: rnd(st) < p, rim: false, air: false, T: 4, sx: a.x0, sy: a.y0, x: d * C.rimX - d * 0.15, y: C.cy, z: C.rimZ + 0.35, vx: d * 0.4, vy: 0, vz: -2.5, fouled });
    if (!fouled) countFga(st, P, st.half ? 1 : 2, 0.5);
    say(st, "slam", P);
    if (fouled) foulCall(st, st.p[fouled.g], P, "shooting");
  }
  if (a.f >= 38) { P.act = null; P.z = 0; }
}
export function blocked(st, D, S) {
  const b = st.ball, d = S.d;
  if (b.st === "shot" && !b.fouled) { /* the attempt stands */ } else if (b.st === "held") countFga(st, S, st.half ? 1 : 2, 0.5);
  Object.assign(b, { st: "loose", own: -1, f: 0, rim: false, fouled: null, x: b.x, y: b.y, z: Math.max(1.5, b.z), vx: -d * (2.5 + rnd(st) * 2), vy: (rnd(st) - 0.5) * 5, vz: 1.5 + rnd(st) * 1.5 });
  st.lastTouch = D.t;
  if (S.act) S.act = { kind: "follow", f: 0 };
  say(st, "block", D, { victim: S.g });
}
export function stripped(st, D, S) {
  const b = st.ball;
  Object.assign(b, { st: "loose", own: -1, f: 0, rim: false, fouled: null, vx: (rnd(st) - 0.5) * 4, vy: (rnd(st) - 0.5) * 4, vz: 1 });
  st.lastTouch = D.t; st.tov[S.t]++;
  if (S.act) S.act = { kind: "follow", f: 0 };
  say(st, "strip", D, { victim: S.g });
}

export function ftRelease(st, S, e) {
  const b = st.ball, d = S.d, rx = d * C.rimX;
  const grade = gradeOf(e, greenOf(S, "ft", human(st, S) ? lv(st).green : 0));
  const p = ftProb(st, S, grade), made = rnd(st) < p;
  S.act = null;
  st.lastRel = { g: S.g, e, grade, c: 0, word: "", p, ft: true, frame: st.frame };
  Object.assign(b, { st: "ftshot", own: -1, from: S.g, f: 0, made, x: S.x + d * 0.2, y: S.y, z: 2.3 });
  b.T = 40;
  aim(b, made ? rx : rx + d * (rnd(st) < 0.5 ? -0.26 : 0.27), made ? C.cy : C.cy + (rnd(st) - 0.5) * 0.4, C.rimZ + 0.05, b.T);
  st.fta[S.t]++;
  say(st, "ftshot", S, { grade });
}
