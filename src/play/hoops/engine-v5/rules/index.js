// THE COURTS engine, rules/index.js: the rules and the dead ball: the tip, the check, possession, the
// throw-in, violations, fouls, free throws, turnovers, scoring, periods.
// v5 (docs/design/BASKETBALL.md 4.3, stage S1b): the possession state machine on the full court:
//   DEAD(reason) --walk--> THROWIN (the ball behind a line, 5 s, the clocks stopped)
//   THROWIN --the pass touched inbounds--> LIVE (st.ps: the backcourt and its 8-second count, the frontcourt)
//   LIVE --OOB | 8 s | over-and-back | shot clock | 3 s | 5 s--> DEAD(violation) --> THROWIN (designated spot)
//   a miss off the rim stops the shot clock; the offence's board resets it to 14, the defence's to 24
// The half court keeps the street's check at the top. Pure: imports nothing from outside src/play/hoops/engine/.
import { spotOf } from "../ai/offence.js";
import { assignRoles } from "../ai/roles.js";
import { HZ, clamp, C, len, TOP_SPOT, tdir, outSpot, dirOf, inLaneOf } from "../court.js";
import { passTo } from "../pass.js";
import { rulesOf } from "./tables.js";
import { flight } from "../physics.js";
import { mkPlayer } from "../players.js";
import { FT_TOP, ftRelease } from "../shot.js";
import { rnd, gauss, lv, you, human, say, markerOf, teamOf } from "../state.js";

// foulOut: personal fouls that end a player's game (six over 48 minutes, scaled; three at least);
// bonus: team fouls in a period after which every defensive foul shoots two.
export const FORMATS = {
  quarters: { id: "quarters", name: "FOUR 2-MINUTE QUARTERS", periods: 4, len: 120, ot: 60, target: 0, foulOut: 3, bonus: 2 },
  to21: { id: "to21", name: "FIRST TO 21", periods: 0, len: 0, ot: 0, target: 21, foulOut: 3, bonus: 4 },
  // the half court's game (3v3, 1v1): to cfg.to (21 or 11), no fouling out, no bonus, no free throws
  street: { id: "street", name: "STREET RULES", periods: 0, len: 0, ot: 0, target: 21, foulOut: 99, bonus: 99 },
};
// The modes: five a side on the full court, three and one a side on a half court.
export const MODES = { "5v5": { id: "5v5", n: 5, half: false, name: "5 ON 5" }, "3v3": { id: "3v3", n: 3, half: true, name: "3 ON 3" }, "1v1": { id: "1v1", n: 1, half: true, name: "1 ON 1" } };
export const STREET_TO = [21, 11];
export const SHOT_CLOCKS = [24, 14];
export const TIP_JUMP = 44;       // the tip: jump this many frames after the whistle to meet the ball at its top
// ---- set pieces -------------------------------------------------------------------------------------
export function setupTip(st) {
  const best = (t) => teamOf(st, t).reduce((a, P) => (P.h > a.h ? P : a));
  st.jumpers = [best(0).g, best(1).g];
  for (const P of st.p) {
    const d = P.d, J = st.jumpers.includes(P.g);
    const ring = [[-2.6, 2.2], [-2.6, -2.2], [-5.5, 3.6], [-5.5, -3.6]];
    if (J) { P.x = -d * 0.55; P.y = C.cy; } else {
      const others = st.p.filter(Q => Q.t === P.t && !st.jumpers.includes(Q.g)), k = others.indexOf(P), [ax, ay] = ring[k] || [-4, 0];
      P.x = d * ax * (P.t === 0 ? 1 : 0.8); P.y = C.cy + ay * (P.t === 0 ? 1 : -1.1);
    }
    P.z = 0; P.vz = 0; P.act = null; P.face = d; P.mv = 0;
  }
  Object.assign(st.ball, { st: "tip", own: -1, x: 0, y: C.cy, z: 1.6, vx: 0, vy: 0, vz: 0, f: 0 });
  st.phase = "tip"; st.t = 0; st.tipPress = -1;
}
// The street game's first ball: no tip; a coin flip for who checks it first at the top.
export function setupCheck(st) {
  const first = rnd(st) < 0.5 ? 0 : 1;
  for (const P of st.p) { P.x = C.rimX - 7 - P.t * 0.8 + P.i * 0.4; P.y = C.cy + (P.i - 1) * 2.5 + (P.t ? 1 : -1) * 0.7; }
  st.tipWinner = first;
  dead(st, 40, "inbound", first, TOP_SPOT);
}
export function giveBall(st, P) {
  const b = st.ball;
  Object.assign(b, { st: "held", own: P.g, f: 0, rim: false, air: false, x: P.x, y: P.y, z: 1, vx: 0, vy: 0, vz: 0, fouled: null, alley: false, cnt: null });
  if (st.poss !== P.t) {
    st.shot = st.cfg.shot * HZ; st.transT = st.half ? 0 : 150; st.pick = null; for (const Q of st.p) Q.cut = null;
    // the street rule: a ball won on the floor (a defensive board, a steal) goes back past the arc first
    if (st.half && st.phase === "live" && st.poss >= 0) st.clear = P.t;
    newPossession(st, P.t);
  }
  st.poss = P.t; st.lastTouch = P.t; P.hold = 0; P.think = 8; P.caught = st.frame; P.post = false; P.drive = null; st.yPend = null; st.inb = false;
  if (P.t === 0 && !st.cfg.auto) st.ctl = P.i;
  // the man who now has it is closed out on: in the frontcourt, near the arc (no closeout sprint at a
  // catch in the backcourt unless his side is pressing: v4's second source of the permanent press)
  const M = markerOf(st, P);
  if (M && (pressing(st, M.t) || len(P.d * C.rimX - P.x, C.cy - P.y) < C.three + 2)) M.close = 40;
}
// ---- the possession (v5) --------------------------------------------------------------------------------
// st.ps: the side with the ball, whether it has reached the frontcourt, how long it has been in the
// backcourt (frames), and the 3-second count of your man (st.lane3).
export function newPossession(st, t) {
  st.ps = { t, fc: st.half, bc: 0 };
  st.lane3 = 0;
}
// is side t's defence pressing (full-court man) this possession? Only when its coach calls it (4.5).
export const pressing = (st, t) => Boolean(st.press && st.press[t]);
// The CPU coach's one press rule: trailing by two possessions or more late in the game (the last 20 % of
// the final period; in a game to 21, the leader at 15 or more), after its own basket; a stop drops it.
export function pressCall(st, D) {
  if (st.half || you(st, D)) return false;
  const F = FORMATS[st.cfg.fmt], down = st.score[1 - D] - st.score[D];
  if (down < 4) return false;
  if (F.periods) return st.q >= F.periods && st.clock < F.len * HZ * 0.2;
  return Math.max(st.score[0], st.score[1]) >= 15;
}
// A violation called (v5): eightsec, backcourt, threesec, fivesec. The ball goes over at the designated
// spot behind the nearer sideline.
export function violation(st, k, P) {
  const x = P ? P.x : st.ball.x, y = P ? P.y : st.ball.y;
  if (st.ball.st === "held" && st.ball.own >= 0) { const H = st.p[st.ball.own]; if (H.act && H.act.kind !== "dunk") H.act = null; }
  turnover(st, k, P, x, Math.abs(x) > C.hx || y < 0 || y > C.w ? clamp(y, 0.6, C.w - 0.6) : y);
}
// Is violation k called on side t? A CPU side is held to the rules it plays by (it never commits the
// 8 seconds or over-and-back; three seconds are tracked from S2); your side by the level's ladder.
export function called(st, t, k) {
  const R = rulesOf(st);
  if (k === "eightsec" && !R.backcourt) return false;
  if (k === "backcourt" && !R.backcourt) return false;
  if (k === "threesec" && !R.lane3) return false;
  if (!you(st, t)) return k !== "threesec";
  if (k === "fivesec") return lv(st).inbound === "call";
  return Boolean(lv(st).viol?.[k]);
}
// A dead ball: everyone walks to their places for `frames`, then `after` ("inbound" to team T at
// spot | "ft" | "period" | "over").
export function dead(st, frames, after, T = -1, spot = null) {
  if (st.half && after === "inbound") spot = TOP_SPOT;
  st.phase = "dead"; st.t = 0; st.deadFor = frames; st.after = after; st.afterTeam = T; st.spot = spot;
  for (const P of st.p) { if (P.act && P.act.kind !== "dunk") P.act = null; P.jumpAt = -1; P.plan = null; P.cut = null; P.charge = 0; P.post = false; }
  st.pick = null; st.help = -1;
  // a man out on fouls leaves now; a stand-in takes his place and his number
  for (const g of st.out) {
    const P = st.p[g], keep = { x: P.x, y: P.y };
    Object.assign(P, mkPlayer(P.t, P.i, [`stand-in-${g}`, "A STAND-IN", 40], st.n, st.half), keep, { pf: 0 });
    say(st, "standin", P);
  }
  if (st.out.length && st.roles) assignRoles(st);   // the roles are refreshed on a substitution
  st.out = [];
  st.reset = after === "ft" ? ftSpots(st) : resetSpots(st, T, spot);
}
export function resetSpots(st, T, spot) {
  const out = new Array(st.p.length);
  if (T < 0) { for (const P of st.p) out[P.g] = [P.x, P.y]; return out; }
  if (!st.half) return throwInSpots(st, T, spot, out);
  const d = tdir(st, T), sp = spot || [-d * 11.2, C.cy - 1.5];
  const offence = st.p.filter(P => P.t === T);
  let inb = offence[0], bd = 1e9;
  if (spot) for (const P of offence) { const k = len(P.x - sp[0], P.y - sp[1]); if (k < bd) { bd = k; inb = P; } }
  for (const P of st.p) {
    if (P === inb) { out[P.g] = sp; continue; }
    if (P.t === T) {
      const [sx, sy] = spotOf(st, T, P.i);
      out[P.g] = spot ? [sx, sy] : [sx - d * 6, sy];
    } else {
      const M = st.p[st.mark[P.g]], [mx0, my] = spotOf(st, T, M.i), mx = spot ? mx0 : mx0 - d * 6;
      const rx = d * C.rimX, k = 1.6 / (len(rx - mx, C.cy - my) || 1);
      out[P.g] = [mx + (rx - mx) * k, my + (C.cy - my) * k];
    }
  }
  st.inbounder = inb.g;
  return out;
}
// The pick-up line (v5): a defence that is not pressing waits about a metre outside the arc.
export const PICK_UP = C.three + 1.0;
// A defender's place goal-side of a man at (mx, my), `gap` metres toward the rim his side defends,
// held inside the pick-up line (plus `extra`) unless his side presses.
export function guardPoint(st, D, mx, my, gap, extra = 1.5) {
  const rx = tdir(st, 1 - D.t) * C.rimX, r = len(rx - mx, C.cy - my) || 1;
  let k = Math.min(gap, r * 0.6) / r;
  let tx = mx + (rx - mx) * k, ty = my + (C.cy - my) * k;
  if (!pressing(st, D.t)) { const tr = len(rx - tx, C.cy - ty), cap = PICK_UP + extra; if (tr > cap) { const q = cap / tr; tx = rx + (tx - rx) * q; ty = C.cy + (ty - C.cy) * q; } }
  return [tx, ty];
}
// The full court's throw-in (v5): the inbounder behind the line, the handler showing for it, the rest
// spaced, the defence back behind its pick-up line. After a make (no spot): the INBOUNDER (a big) behind
// his own end line beside the basket, BH1 at the near elbow extended, BH2 the safety behind the ball.
export function throwInSpots(st, T, spot, out) {
  const d = tdir(st, T), R = st.roles[T], made = !spot;
  st.press = [false, false];
  st.press[1 - T] = made && pressCall(st, 1 - T);
  const sp = spot || [-d * (C.hx + 0.6), C.cy - 2.6];
  let inb = st.p[R.inb];
  if (!made) { let bd = 1e9; for (const P of st.p) if (P.t === T && P.g !== R.bh1) { const k = len(P.x - sp[0], P.y - sp[1]); if (k < bd) { bd = k; inb = P; } } }
  const endLine = Math.abs(sp[0]) > C.hx;
  const recv = made ? [-d * (C.hx - 5.0), C.cy + 3.4]
    : endLine ? [Math.sign(sp[0]) * (C.hx - 4.5), sp[1] < C.cy ? C.cy + 3.4 : C.cy - 3.4]
    : [clamp(sp[0] + d * 1.5, -C.hx + 2, C.hx - 2), sp[1] < C.cy ? 3.6 : C.w - 3.6];
  const safety = [clamp(recv[0] - d * 3.5, -C.hx + 1.5, C.hx - 1.5), clamp(recv[1] < C.cy ? recv[1] + 4.5 : recv[1] - 4.5, 1.5, C.w - 1.5)];
  const front = d * sp[0] > 0;
  for (const P of st.p) if (P.t === T) {
    if (P === inb) out[P.g] = sp;
    else if (P.g === R.bh1) out[P.g] = recv;
    else if (P.g === R.bh2 && inb.g !== R.bh2) out[P.g] = safety;
    else { const [sx, sy] = spotOf(st, T, P.i); out[P.g] = front ? [sx, sy] : [sx - d * 6, sy]; }
  }
  for (const P of st.p) if (P.t !== T) { const M = st.p[st.mark[P.g]], [mx, my] = out[M.g]; out[P.g] = guardPoint(st, P, mx, my, 1.6); }
  st.inbounder = inb.g;
  st.recv = { g: R.bh1, x: recv[0], y: recv[1], made, end: endLine || made };
  return out;
}
// The throw-in begins (v5): the inbounder has the ball behind the line; nothing runs until it is touched
// inbounds. Your side: you steer the handler and call for it (A); with cfg.inb "me", you throw it in.
export function startThrowIn(st, I) {
  const T = I.t, b = st.ball;
  if (st.poss !== T) { st.shot = st.cfg.shot * HZ; st.transT = 150; st.pick = null; for (const Q of st.p) Q.cut = null; newPossession(st, T); }
  else if (!st.ps || st.ps.t !== T) newPossession(st, T);
  st.poss = T; st.lastTouch = T; st.keepShot = false;
  Object.assign(b, { st: "held", own: I.g, f: 0, rim: false, air: false, x: I.x, y: I.y, z: 1, vx: 0, vy: 0, vz: 0, fouled: null, alley: false, cnt: null });
  I.hold = 0; I.vx = 0; I.vy = 0; I.act = null;
  st.phase = "throwin"; st.t = 0;
  st.ti = { g: I.g, t: T, f: 0, call: -1, recv: st.recv.g, x: I.x, y: I.y, end: st.recv.end };
  if (!st.cfg.auto) {
    if (T === 0) st.ctl = st.cfg.inb === "me" ? I.i : st.p[st.recv.g].i;
    else if (lv(st).sw !== "poss") { const D = markerOf(st, st.p[st.recv.g]); if (D) st.ctl = D.i; }
    st.ctlFor = st.recv.g;
  }
  st.ev.push("inbound");
}
// The free-throw line-up: the shooter at the line, two defenders nearest the rim, the shooter's
// side next, the rest outside the arc.
export function ftSpots(st) {
  const F = st.ft, S = st.p[F.g], d = S.d, rx = d * C.rimX, out = new Array(st.p.length);
  const lane = (k, s) => [rx - d * (1.1 + k * 0.95), C.cy + s * (C.laneHW + 0.35)];
  const off = st.p.filter(P => P.t === S.t && P !== S), def = st.p.filter(P => P.t !== S.t);
  out[S.g] = [d * C.ftX, C.cy];
  [lane(0, 1), lane(0, -1), lane(2, 1), [rx - d * 6.6, C.cy + 1.4], [rx - d * 6.6, C.cy - 1.4]].forEach((p, k) => { out[def[k].g] = p; });
  [lane(1, 1), lane(1, -1), [rx - d * 7.8, C.cy + 3.6], [rx - d * 7.8, C.cy - 3.6]].forEach((p, k) => { out[off[k].g] = p; });
  return out;
}

// a shot from past the arc: three, or two on the street
export const longPts = (st) => (st.half ? 2 : 3);
// The street rule broken: a shot by a side that has not taken the ball back past the arc. The ball
// goes over, checked at the top.
export function noClear(st, P) {
  const b = st.ball;
  b.st = "dead"; b.own = -1; st.tov[P.t]++; st.clear = -1;
  say(st, "noclear", P);
  dead(st, 70, "inbound", 1 - P.t, TOP_SPOT);
}
// ---- fouls ------------------------------------------------------------------------------------------
// kind: "shooting" (free throws when the shot lands: one after a make, else two or three),
// "reach", "block", "loose" (the bonus shoots two, else a side-out), "charge" (the offence's foul: a
// turnover, a personal foul, not a team foul).
export function foulCall(st, F, V, kind) {
  const Fm = FORMATS[st.cfg.fmt];
  F.pf++; st.fouls[F.t]++;
  if (kind !== "charge") { st.tf[F.t]++; if (lateNow(st)) st.tfLate[F.t]++; }
  if (F.pf >= Fm.foulOut && !F.key.startsWith("stand-in")) st.out.push(F.g);
  say(st, kind === "shooting" ? "shootfoul" : kind === "charge" ? "charge" : kind === "block" ? "blockfoul" : kind === "reach" ? "reachfoul" : "loosefoul", F, { victim: V.g, pf: F.pf });
  if (F.pf >= Fm.foulOut) st.ev.push("foulout");
  if (kind === "shooting") return;   // resolved when the shot comes down
  const b = st.ball;
  if (b.st === "held" && b.own >= 0) { const H = st.p[b.own]; if (H.act && H.act.kind !== "dunk") H.act = null; }
  b.st = "dead"; b.own = -1;
  // the street: no free throws, no bonus; the ball back to the fouled side (a charge: over), checked
  if (st.half) { if (kind === "charge") st.tov[F.t]++; dead(st, 80, "inbound", kind === "charge" ? 1 - F.t : V.t, TOP_SPOT); return; }
  if (kind === "charge") { st.tov[F.t]++; dead(st, 80, "inbound", 1 - F.t, sideSpot(F.x)); return; }
  if (inPenalty(st, F.t)) { st.ev.push("bonus"); toLine(st, V, 2, 90); return; }
  const sc = Math.min(st.cfg.shot, 14) * HZ;
  if (st.shot < sc) st.shot = sc;
  dead(st, 80, "inbound", V.t, sideSpot(V.x));
  st.keepShot = true;
}
// a side-out: behind the near sideline (v4 stood the inbounder 0.3 m inside it, on the floor)
// ---- the penalty (rules/tables.js) ------------------------------------------------------------------------
const lateNow = (st) => { const R = rulesOf(st); return Boolean(R.late && FORMATS[st.cfg.fmt].periods && st.clock <= R.late.secs * HZ); };
// is team t's next defensive foul two shots?
export function inPenalty(st, t) {
  const R = rulesOf(st);
  if (st.tf[t] >= R.penaltyOn) return true;
  return Boolean(R.late && lateNow(st) && (st.tfLate?.[t] || 0) >= R.late.fouls);
}
// a game to 21: the team fouls reset each time the leading score passes 7 and 14
export function foulReset(st, before) {
  const R = rulesOf(st);
  if (!R.resetEvery) return;
  const was = Math.floor(before / R.resetEvery), now = Math.floor(Math.max(st.score[0], st.score[1]) / R.resetEvery);
  if (now > was) { st.tf = [0, 0]; st.ev.push("foulreset"); }
}
export const sideSpot = (x) => [clamp(x, -C.hx + 1.5, C.hx - 1.5), -0.5];
export function toLine(st, S, n, wait = 80) {
  st.ft = { g: S.g, n, k: 0, team: S.t, t: 0, res: [] };
  dead(st, wait, "ft", S.t);
  say(st, "toline", S, { n });
}

export function ftStep(st) {
  const F = st.ft, S = st.p[F.g], b = st.ball;
  F.t++;
  if (b.st === "held") {
    b.x = S.x + S.d * 0.3; b.y = S.y; b.z = S.act?.kind === "ftshot" ? 1.2 + Math.min(1, S.act.f / FT_TOP) * 1.2 : 1.0;
    if (S.act?.kind === "ftshot") { S.act.f++; if (S.act.f > FT_TOP + 30) ftRelease(st, S, S.act.f - FT_TOP); }
    else if (!human(st, S) && F.t === 50) S.act = { kind: "ftshot", f: 0, rel: clamp(Math.round(FT_TOP + gauss(st) * (3 + 6 * (1 - S.S.ft))), 4, FT_TOP + 30) };
    if (S.act?.kind === "ftshot" && S.act.rel >= 0 && S.act.f >= S.act.rel) ftRelease(st, S, S.act.f - FT_TOP);
    if (F.t > 600 && b.st === "held") { st.lastRel = { g: S.g, e: 99, grade: "VERY LATE", c: 0, word: "TEN SECONDS", ft: true, frame: st.frame }; ftLand(st, S, false, true); }
    return;
  }
  if (b.st === "ftshot") {
    flight(b);
    if (b.f++ >= b.T) ftLand(st, S, b.made);
  }
}
export function ftLand(st, S, made, violation = false) {
  const F = st.ft, b = st.ball, d = S.d;
  F.k++; F.res.push(made);
  if (made) { const before = Math.max(st.score[0], st.score[1]); st.score[S.t]++; st.pts[S.g]++; st.ftm[S.t]++; foulReset(st, before); say(st, "ftmade", S, { k: F.k, n: F.n }); }
  else say(st, violation ? "ftviolation" : "ftmiss", S, { k: F.k, n: F.n });
  if (st.target && st.score[S.t] >= st.target) { st.ft = null; b.st = "dead"; dead(st, 150, "over"); return; }
  if (F.k < F.n) { Object.assign(b, { st: "held", own: S.g, f: 0 }); F.t = 0; return; }
  st.ft = null;
  if (made || violation) { b.st = "through"; Object.assign(b, { x: d * C.rimX, y: C.cy, z: C.rimZ, vx: 0, vy: 0, vz: -1.5 }); if (violation) b.st = "dead"; endOrInbound(st, 1 - S.t); return; }
  // the last one off the iron: live
  Object.assign(b, { st: "loose", own: -1, f: 0, rim: true, x: d * C.rimX - d * 0.2, y: C.cy, z: C.rimZ, vx: -d * (1.2 + rnd(st) * 2.2), vy: (rnd(st) - 0.5) * 4, vz: 2.2 + rnd(st) * 1.8 });
  st.phase = "live"; st.t = 0; st.shot = st.cfg.shot * HZ; st.lastTouch = S.t; st.poss = S.t;
}
export function endOrInbound(st, T) {
  if (st.buzzer || (FORMATS[st.cfg.fmt].periods && st.clock <= 0)) { endPeriod(st); return; }
  dead(st, 75, "inbound", T, null);
}

export function turnover(st, k, P, x, y) {
  const T = 1 - (P ? P.t : st.lastTouch);
  const sp = outSpot(x, y);
  say(st, k, P);
  st.tov[1 - T]++;
  st.ball.st = "dead"; st.ball.own = -1;
  dead(st, 70, "inbound", T, sp);
}
export function scored(st, S, pts) {
  const before = Math.max(st.score[0], st.score[1]);
  st.score[S.t] += pts; st.pts[S.g] += pts;
  foulReset(st, before);
  const cnt = st.ball.cnt;
  if (st.ball.fouled) { st.fga[S.t]++; if (pts === longPts(st) && (!st.half || st.ball.kind === "jump")) st.tpa[S.t]++; if (st.ball.kind === "dunk" || st.ball.kind === "lay") st.rima[S.t]++; }
  st.fgm[S.t]++; if (pts === longPts(st) && (!st.half || st.ball.kind === "jump")) st.tpm[S.t]++;
  if ((cnt && cnt.rim) || (st.ball.fouled && (st.ball.kind === "dunk" || st.ball.kind === "lay"))) st.rimm[S.t]++;
  // the run, and the hot hand
  if (st.run[0] === S.t) st.run[1] += pts; else st.run = [S.t, pts];
  S.streak = Math.max(0, S.streak) + 1;
  if (S.streak >= 3 && !S.hot) { S.hot = true; st.ev.push("hot"); }
  say(st, st.ball.kind === "dunk" ? "dunk" : pts === longPts(st) && st.ball.kind === "jump" ? (st.half ? "streettwo" : "three") : st.half ? "one" : "two", S, { pts, run: st.run[1], andone: Boolean(st.ball.fouled) });
  if (st.target && st.score[S.t] >= st.target) { st.ball.st = "dead"; dead(st, 150, "over"); return; }
  // the street: the ball to the side scored on, or (make-it-take-it, or an and-one) back to the scorer
  if (st.half) { const T = st.cfg.mitt || st.ball.fouled ? S.t : 1 - S.t; st.ball.fouled = null; dead(st, 75, "inbound", T, TOP_SPOT); st.ball.st = "through"; return; }
  if (st.ball.fouled) { const sh = st.ball.fouled; st.ball.st = "through"; st.ev.push("andone"); toLine(st, S, 1, 90); st.ball.fouled = null; void sh; return; }
  if (st.buzzer) { endPeriod(st); return; }
  dead(st, 75, "inbound", 1 - S.t, null);
  st.ball.st = "through";
}
export function endPeriod(st) {
  const F = FORMATS[st.cfg.fmt];
  st.buzzer = false;
  if (st.q >= F.periods && st.score[0] !== st.score[1]) { say(st, "final"); dead(st, 150, "over"); return; }
  say(st, st.q >= F.periods ? "overtime" : "period");
  if (st.ball.st !== "through") st.ball.st = "dead";
  st.q++;
  st.tf = [0, 0]; st.tfLate = [0, 0]; st.poss = -1;
  for (const P of st.p) P.sta = Math.min(1, P.sta + 0.35);
  const T = st.q >= 5 ? (st.q % 2 ? st.tipWinner : 1 - st.tipWinner) : st.q === 4 ? st.tipWinner : 1 - st.tipWinner;
  dead(st, 150, "inbound", T, null);
  st.clock = (st.q > F.periods ? F.ot : F.len) * HZ;
}

// ---- the possession, every live frame on the full court (v5) ----------------------------------------------
// The frontcourt is reached when the ball and the man holding it are over half court; until then the
// 8-second count runs (team control, the throw-in touched); back over it is over-and-back. A shot ends
// team control; a loose ball is lenient (any touch may have been the defence's). Your man's three
// seconds in the lane count while your side has it in the frontcourt (he may be holding it; a shot or a
// dunk under way is allowed).
export function possStep(st) {
  const b = st.ball, ps = st.ps;
  if (!ps || st.half || st.phase !== "live") return;
  const T = ps.t, d = dirOf(T), R = rulesOf(st);
  if (b.st === "shot" || b.st === "through") { ps.fc = false; ps.bc = 0; st.lane3 = 0; return; }
  if (b.st === "loose") { ps.fc = false; return; }
  const H = b.st === "held" && b.own >= 0 ? st.p[b.own] : null, from = b.st === "pass" ? st.p[b.from] : null;
  if ((H ? H.t : from ? from.t : -1) !== T || st.inb) return;
  if (H) {
    if (d * H.x > 0.15) ps.fc = true;
    else if (ps.fc && d * H.x < -0.15 && called(st, T, "backcourt")) { violation(st, "backcourt", H); return; }
  }
  if (!ps.fc && ++ps.bc >= R.backcourt * HZ && called(st, T, "eightsec")) { violation(st, "eightsec", H || from); return; }
  if (ps.fc && you(st, T) && called(st, T, "threesec")) {
    const P = st.p[st.ctl], busy = P.act && (P.act.kind === "jump" || P.act.kind === "dunk");
    if (inLaneOf(P.x, P.y, d) && !busy) { if (++st.lane3 >= 3 * HZ) violation(st, "threesec", P); }
    else st.lane3 = 0;
  }
}
// the throw-in pass (v5): the ball is live; the clocks wait for it to be touched inbounds
export function throwIn(st, I, Q, kind = "chest") {
  passTo(st, I, Q, kind);
  st.phase = "live"; st.inb = true; st.ti = null;
  st.ev.push("throwin");
}
