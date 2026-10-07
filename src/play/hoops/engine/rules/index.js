// THE COURTS engine, rules/index.js: the rules and the dead ball: the tip, the check, possession, fouls, free throws, turnovers, scoring, periods (today's phase machine, unchanged; the possession state machine of 4.3 replaces it in S1b).
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
import { spotOf } from "../ai/offence.js";
import { HZ, clamp, C, len, TOP_SPOT, tdir } from "../court.js";
import { flight } from "../physics.js";
import { mkPlayer } from "../players.js";
import { FT_TOP, ftRelease } from "../shot.js";
import { rnd, gauss, human, say, markerOf, teamOf } from "../state.js";

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
  }
  st.poss = P.t; st.lastTouch = P.t; P.hold = 0; P.think = 8; P.caught = st.frame; P.post = false; P.drive = null; st.yPend = null;
  if (P.t === 0 && !st.cfg.auto) st.ctl = P.i;
  // the man who now has it is closed out on
  const M = markerOf(st, P);
  if (M) M.close = 40;
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
  st.out = [];
  st.reset = after === "ft" ? ftSpots(st) : resetSpots(st, T, spot);
}
export function resetSpots(st, T, spot) {
  const out = new Array(st.p.length);
  if (T < 0) { for (const P of st.p) out[P.g] = [P.x, P.y]; return out; }
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
  if (kind !== "charge") st.tf[F.t]++;
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
  if (st.tf[F.t] > Fm.bonus) { st.ev.push("bonus"); toLine(st, V, 2, 90); return; }
  const sc = Math.min(st.cfg.shot, 14) * HZ;
  if (st.shot < sc) st.shot = sc;
  dead(st, 80, "inbound", V.t, sideSpot(V.x));
  st.keepShot = true;
}
export const sideSpot = (x) => [clamp(x, -C.hx + 1.5, C.hx - 1.5), 0.3];
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
  if (made) { st.score[S.t]++; st.pts[S.g]++; st.ftm[S.t]++; say(st, "ftmade", S, { k: F.k, n: F.n }); }
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
  const sp = [clamp(x, -C.hx + 0.4, C.hx - 0.4), clamp(y, 0.3, C.w - 0.3)];
  say(st, k, P);
  st.tov[1 - T]++;
  st.ball.st = "dead"; st.ball.own = -1;
  dead(st, 70, "inbound", T, sp);
}
export function scored(st, S, pts) {
  st.score[S.t] += pts; st.pts[S.g] += pts;
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
  st.tf = [0, 0];
  for (const P of st.p) P.sta = Math.min(1, P.sta + 0.35);
  const T = st.q >= 5 ? (st.q % 2 ? st.tipWinner : 1 - st.tipWinner) : st.q === 4 ? st.tipWinner : 1 - st.tipWinner;
  dead(st, 150, "inbound", T, null);
  st.clock = (st.q > F.periods ? F.ot : F.len) * HZ;
}
