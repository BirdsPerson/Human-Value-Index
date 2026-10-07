// THE COURTS engine, game.js: the game: newGame, step (one 60 Hz frame), the result, replay, and the checks' set-ups.
// Split from the v4 sim.js unchanged (docs/design/BASKETBALL.md 4.2, stage S1a); pure: imports nothing
// from outside src/play/hoops/engine/.
//
// THE COURTS, playable (docs/CITY_SPEC.md "PLAYABLE SPORTS", Basketball). The game itself: pure,
// no DOM, no clock, no Math.random, no trig. A fixed 60 Hz step over a seeded generator, so a game
// is a function of (version, seed, cfg, the human's input per frame): the browser plays it, and
// anything holding the record plays it again to the same result (scripts/check-hoops.mjs does).
// Only + - * / and sqrt touch the state, which IEEE 754 rounds the same everywhere.
//
// ENGINE VERSION 4 (2K20 conventions: lead passes thrown to where a moving receiver will be, bounce
// passes and lobs on real arcs, deflections in the lane, catch-on-the-move; ICON PASSING (hold RB, a
// face button passes to the teammate wearing it); the double-tap-Y alley-oop; positions and builds;
// 3v3 and 1v1 on a half court under street rules, cfg.mode). Versions 1 to 4 replay on the frozen
// ../v1/ .. ../v4/sim.js (../replay.js picks by version; the router stays in the adapter).
//
// The court is in metres, NBA lines: x along the length (the centre line at 0, the baselines at
// +-14.325), y across it (the near sideline, the camera's, at 0; the far one at 15.24), z up. The
// rims are 3.05 m up, 1.575 m in from each baseline. Team 0 is the viewer's and attacks +x all game;
// team 1 attacks -x. Five a side: the league's own drafted fives. On a HALF COURT (cfg.mode "3v3",
// "1v1") both sides attack the +x rim, x < 0 is out, and street rules hold: ones and twos, first to
// 21 (or 11), check ball at the top of the key, clear it past the arc after a defensive rebound or a
// steal, make-it-take-it if asked (cfg.mitt), no free throws (a foul gives the ball back).
//
// Control (2K conventions on a virtual pad, one bitmask a frame, BTN): the human steers one player
// of team 0 (st.ctl): the ball carrier on offence; on defence the defender nearest the ball when it
// changed hands, A switches. Offence: left stick moves, RT sprints, X held = the shot (let go at the
// top: the release grade), A passes toward the stick, Y lobs (double-tap Y: an alley-oop to the
// cutter nearest the rim), B bounce-passes, RB held puts a button over each teammate (A, B, X, Y) and
// that button passes to him, LB calls a pick, LT posts up, the right stick does dribble moves (flick sideways:
// crossover; back: stepback; toward the rim: drive; rotate: spin). A quick reversal of the left
// stick is a dribble move too. Defence: X reaches for the steal, Y jumps (block, rebound), B takes a
// charge, LT is intense D, A switches. Every other player is the CPU, from its ratings.
import { helpStep } from "./ai/defence.js";
import { cpuThink } from "./ai/index.js";
import { pickStep, screens } from "./ai/offence.js";
import { HZ, DT, G, clamp, C, dirOf, len, isThree, distRim, inBounds } from "./court.js";
import { humanThink } from "./input/controls.js";
import { LEVELS, NEUTRAL, levelOf } from "./levels.js";
import { moveStep } from "./moves.js";
import { passTo } from "./pass.js";
import { aim, ballStep, contact } from "./physics.js";
import { mkPlayer } from "./players.js";
import { FORMATS, MODES, STREET_TO, SHOT_CLOCKS, TIP_JUMP, setupTip, setupCheck, giveBall, toLine, ftStep, turnover, endPeriod } from "./rules/index.js";
import { TOP, release, dunkStep } from "./shot.js";
import { rnd, lv, you, human, holder, say, markerOf, nearestToBall } from "./state.js";

export const VERSION = 4;
// cfg: {mode: "5v5" | "3v3" | "1v1" (MODES), fmt: "quarters" | "to21" (5v5; a half court plays
// "street"), to: 21 | 11 and mitt (make-it-take-it) on a half court, shot: 24 | 14, level (LEVELS; old
// records: assist), home: [[key, name, r, arch?, pos?, hand?] x n], away, auto (team 0 played by the
// CPU too: the checks and the attract mode)}. Rows are taken in the order given (the page sorts each
// side best first: the best brings the ball up).
export function newGame(seed = 1, cfg = {}) {
  const mode = MODES[cfg.mode] ? cfg.mode : "5v5", M = MODES[mode], n = M.n, half = M.half;
  const fmt = half ? "street" : FORMATS[cfg.fmt] && cfg.fmt !== "street" ? cfg.fmt : "quarters";
  const shot = SHOT_CLOCKS.includes(cfg.shot) ? cfg.shot : 24;
  const to = half ? (STREET_TO.includes(cfg.to) ? cfg.to : 21) : FORMATS[fmt].target;
  const rows = (r) => { const a = (Array.isArray(r) ? r : []).slice(0, n); while (a.length < n) a.push([`stand-in-${a.length}`, "A STAND-IN", 40]); return a; };
  const st = {
    v: VERSION, seed: seed >>> 0, rng: seed | 0, frame: 0, n, half, target: to, clear: -1,
    cfg: { mode, fmt, shot, level: levelOf(cfg), auto: Boolean(cfg.auto), ...(half ? { to, mitt: Boolean(cfg.mitt) } : {}) },
    p: [...rows(cfg.home).map((r, i) => mkPlayer(0, i, r, n, half)), ...rows(cfg.away).map((r, i) => mkPlayer(1, i, r, n, half))],
    ball: { st: "dead", own: -1, x: 0, y: C.cy, z: 1, vx: 0, vy: 0, vz: 0, f: 0, from: -1, to: -1, made: false, pts: 0, T: 0, kind: "", rim: false, air: false, sx: 0, sy: 0, fouled: null, pass: "", alley: false },
    phase: "tip", t: 0, deadFor: 0, after: null, afterTeam: -1, spot: null,
    q: 1, clock: FORMATS[fmt].len * HZ, shot: shot * HZ, score: [0, 0], poss: -1, tipWinner: -1, lastTouch: -1,
    ctl: 0, ctlFor: null, lastRel: null, mask: 0, prev: 0, ev: [], note: null, buzzer: false, reset: null, pts: new Array(2 * n).fill(0),
    fga: [0, 0], fgm: [0, 0], tpa: [0, 0], tpm: [0, 0], rima: [0, 0], rimm: [0, 0], fta: [0, 0], ftm: [0, 0], fouls: [0, 0], tov: [0, 0],
    tf: [0, 0], mark: Array.from({ length: 2 * n }, (_, g) => (g + n) % (2 * n)), pick: null, help: -1, ft: null, run: [-1, 0], out: [], gest: null, transT: 0,
    iconOn: false, icons: [], yPend: null, lastCatch: null,
  };
  st.lv = st.cfg.auto ? NEUTRAL : LEVELS[st.cfg.level];
  if (half) setupCheck(st); else setupTip(st);
  return st;
}
// ---- one step ---------------------------------------------------------------------------------------
export function step(st, mask = 0) {
  st.ev = []; st.iconOn = false;
  for (const P of st.p) { P.ox = P.x; P.oy = P.y; }
  const press = mask & ~st.prev;
  st.prev = mask; st.mask = mask; st.frame++;
  if (st.phase === "over") return st;
  const b = st.ball, F = FORMATS[st.cfg.fmt];
  st.t++;

  if (st.phase === "tip") {
    for (const g of st.jumpers) {
      const P = st.p[g], go = P.t === 0 && !st.cfg.auto ? st.tipPress >= 0 && st.t >= st.tipPress : st.t === TIP_JUMP + Math.round((1 - P.k) * 6);
      if (go && P.z === 0 && !P.tipped) { P.tipped = true; P.vz = Math.sqrt(2 * G * (P.leap + 0.2)); P.z = 0.0001; }
    }
    if (st.t === 30) st.ev.push("toss");
    if (st.t === 63) {
      const J = st.jumpers.map(g => st.p[g]);
      let p0 = 0.5 + 0.35 * (J[0].k - J[1].k);
      if (!st.cfg.auto) { const e = st.tipPress < 0 ? 99 : Math.abs(st.tipPress - TIP_JUMP); p0 += e <= 6 ? 0.2 : e <= 14 ? 0.05 : -0.15; p0 += lv(st).tip; }
      const w = rnd(st) < clamp(p0, 0.05, 0.95) ? 0 : 1;
      st.tipWinner = w;
      const to = st.p.filter(Q => Q.t === w && !st.jumpers.includes(Q.g)).reduce((a, Q) => (len(Q.x, Q.y - C.cy) < len(a.x, a.y - C.cy) ? Q : a));
      for (const P of J) P.tipped = false;
      st.phase = "live"; st.poss = w;
      passTo(st, J[w], to);
      Object.assign(b, { x: J[w].x + dirOf(w) * 0.3, y: C.cy, z: 3.3 });
      aim(b, to.x, to.y, 1.4, 30);
      say(st, "tip", J[w]);
    }
  }
  if (st.phase === "live" && !st.cfg.auto) {
    const H = holder(st);
    if (H && H.t === 0) st.ctl = H.i;
    else if ((H && H.t === 1 && st.ctlFor !== H.g) || (b.st === "loose" && st.ctlFor !== "loose")) {
      // the level's auto-switch: to the man guarding the new ball handler, the man nearest the ball,
      // or (HALL OF FAME) only when the ball changes sides
      const sw = lv(st).sw, wasD = typeof st.ctlFor === "number" && st.ctlFor >= 5;
      if (sw !== "poss" || !wasD || !H) { const N = (sw === "mark" && H && markerOf(st, H)) || nearestToBall(st, 0); if (N) st.ctl = N.i; }
    }
    st.ctlFor = H ? H.g : b.st === "loose" ? "loose" : st.ctlFor;
  }
  if (st.phase === "ft" && !st.cfg.auto && st.ft && st.p[st.ft.g].t === 0) st.ctl = st.p[st.ft.g].i;
  if (st.transT > 0) st.transT--;
  if (st.phase === "live") { pickStep(st); helpStep(st); }
  for (const P of st.p) {
    if (P.cool > 0) P.cool--;
    if (P.hands > 0) P.hands--;
    if (P.screened > 0) P.screened--;
    if (P.close > 0) P.close--;
    if (P.burst > 0) P.burst--;
    if (P.sb > 0) P.sb--;
    if (P.charge > 0) P.charge--;
    if (P.boxing > 0) P.boxing--;
    if (P.moveCool > 0) P.moveCool--;
    if (P.stumble > 0) { P.stumble--; P.vx = 0; P.vy = 0; }
    if ((st.frame + P.g) % 90 === 0 && P.heat > 0) P.heat--;
    if ((st.phase === "live" || st.phase === "ft") && human(st, P)) humanThink(st, P, mask, press);
    else if (st.phase === "tip" && P.t === 0 && !st.cfg.auto && st.jumpers.includes(P.g)) humanThink(st, P, mask, press);
    else cpuThink(st, P);
  }
  // actions under way
  for (const P of st.p) {
    const a = P.act;
    if (!a) continue;
    if (a.kind === "dunk") { if (st.phase !== "dead" || a.f > 16) dunkStep(st, P); else P.act = null; continue; }
    if (a.kind === "move") { if (st.phase === "live" && st.ball.own === P.g && st.ball.st === "held") moveStep(st, P); else P.act = null; continue; }
    if (a.kind === "ftshot") continue;
    a.f++;
    if (a.kind === "jump" && st.phase === "live" && a.rel >= 0 && a.f >= a.rel) release(st, P, a.f - TOP);
    if (a.kind === "follow" && a.f > 30 && P.z === 0) P.act = null;
  }
  if (st.phase === "live") screens(st);
  // a defender squared up in front of the ball slows the drive (more for a good defender, intense D)
  const Hb = st.phase === "live" ? holder(st) : null;
  if (Hb && (Hb.vx || Hb.vy) && Hb.act?.kind !== "move" && !Hb.post) {
    const v = len(Hb.vx, Hb.vy);
    for (const D of st.p) {
      if (D.t === Hb.t || D.z > 0 || D.stumble > 0 || D.charge > 0) continue;
      const ox = D.x - Hb.x, oy = D.y - Hb.y, d = len(ox, oy);
      if (d < 0.95 && (ox * Hb.vx + oy * Hb.vy) / (d * v || 1) > 0.45) {
        const k = 0.55 - 0.3 * D.S.perD + 0.2 * Hb.S.handle + (human(st, Hb) ? lv(st).drive : 0) - (D.intense ? 0.12 : 0) + (Hb.burst > 0 ? 0.25 : 0);
        Hb.vx *= clamp(k, 0.2, 0.95); Hb.vy *= clamp(k, 0.2, 0.95);
        break;
      }
    }
  }
  if (st.phase === "live") contact(st);
  // move, sprint and tire, jump, land, keep apart
  for (const P of st.p) {
    if (P.act?.kind !== "dunk") {
      const busy = P.act && (P.act.kind === "jump" || P.act.kind === "ftshot" || P.z > 0);
      if (P.cool > 22) { P.vx *= 0.45; P.vy *= 0.45; }
      if (P.screened > 0) { P.vx *= 0.25; P.vy *= 0.25; }
      // sealed off the glass: an attacker behind a defender boxing him out barely gets through
      if (st.ball.st === "shot" || (st.ball.st === "loose" && st.ball.rim)) for (const D of st.p) {
        if (D.t === P.t || !(D.boxing > 0) || st.poss !== P.t) continue;
        if (len(D.x - P.x, D.y - P.y) < 0.75 && distRim(D, P) < distRim(P)) { P.vx *= 0.35; P.vy *= 0.35; break; }
      }
      const moving = P.vx || P.vy;
      let mul = 1;
      if (moving && P.act?.kind !== "move") {
        if (P.sprint && P.sta > 0.05) { mul = 1.2 * (0.82 + 0.18 * P.sta); P.sta -= 0.0025 * (you(st, P.t) ? lv(st).sta : 1); }
        if (P.burst > 0) mul *= 1.22;
      }
      if (P.intense) P.sta -= 0.0008;
      if (!(moving && P.sprint)) P.sta += moving ? 0.0005 : 0.0011;
      P.sta = clamp(P.sta, 0, 1);
      if (!busy) { P.x += P.vx * DT * mul; P.y += P.vy * DT * mul; }
      if (moving) { P.mv++; P.still = 0; if (!P.post) { if (P.vx > 0.2) P.face = 1; else if (P.vx < -0.2) P.face = -1; } } else { P.mv = 0; P.still++; }
      if (P.z > 0) { P.vz -= G * DT; P.z += P.vz * DT; if (P.z <= 0) { P.z = 0; P.vz = 0; if (P.act && P.act.kind !== "follow" && P.act.kind !== "move") P.act = P.act.kind === "jump" ? { kind: "follow", f: 99 } : null; } }
    }
    P.x = clamp(P.x, -C.hx - 1.2, C.hx + 1.2); P.y = clamp(P.y, -1.2, C.w + 1.2);
  }
  for (let i = 0; i < st.p.length; i++) for (let j = i + 1; j < st.p.length; j++) {
    const A = st.p[i], B = st.p[j];
    if (A.act?.kind === "dunk" || B.act?.kind === "dunk") continue;
    const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy;
    if (d2 >= 0.5 * 0.5) continue;
    const d = Math.sqrt(d2) || 0.01, push = (0.5 - d) / 2, nx = d2 ? dx / d : 1, ny = d2 ? dy / d : 0;
    A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
  }
  if (st.phase === "live") {
    const H = holder(st);
    if (H && !human(st, H)) { H.x = clamp(H.x, st.half ? 0.3 : -C.hx + 0.2, C.hx - 0.2); H.y = clamp(H.y, 0.2, C.w - 0.2); }
  }
  // how fast each man actually moved this frame (the lead passes read it)
  for (const P of st.p) { const vx = (P.x - P.ox) * HZ, vy = (P.y - P.oy) * HZ, v = len(vx, vy), k = v > 9 ? 9 / v : 1; P.ax = vx * k; P.ay = vy * k; }
  if (st.phase === "ft") ftStep(st); else ballStep(st);
  // the street: past the arc with the ball, it is cleared
  if (st.half && st.clear >= 0 && st.phase === "live") { const H = holder(st); if (H && H.t === st.clear && isThree(H.x, H.y, 1)) { st.clear = -1; st.ev.push("cleared"); } }

  if (st.phase === "live") {
    const H = holder(st);
    if (H && !inBounds(st, H.x, H.y)) turnover(st, "oob", H, H.x, H.y);
    else {
      if (b.st !== "shot" && b.st !== "dead" && b.st !== "through") {
        if (--st.shot <= 0) { const P = H || st.p[st.p.findIndex(Q => Q.t === st.poss)]; turnover(st, "shotclock", P, P.x, P.y); }
      }
      if (st.phase === "live" && F.periods && --st.clock <= 0) {
        st.clock = 0;
        const inAir = b.st === "shot" || st.p.some(P => P.act?.kind === "dunk" && P.act.f < 16) || st.p.some(P => P.act?.kind === "jump" && b.st === "held" && b.own === P.g);
        if (inAir && !st.buzzer) { st.buzzer = true; st.ev.push("buzzer"); }
        else if (!inAir) { st.ev.push("buzzer"); endPeriod(st); }
      }
    }
  }
  if (st.phase === "dead" && st.t >= st.deadFor) {
    if (st.after === "over") { st.phase = "over"; st.ev.push("over"); }
    else if (st.after === "ft") {
      const S = st.p[st.ft.g];
      for (const P of st.p) { if (P.act?.kind !== "dunk") P.act = null; const r = st.reset[P.g]; P.x = r[0]; P.y = r[1]; P.z = 0; P.vz = 0; }
      st.phase = "ft"; st.ft.t = 0;
      Object.assign(st.ball, { st: "held", own: S.g, f: 0, fouled: null });
      st.ev.push("ftset");
    } else if (st.after === "inbound") {
      const I = st.p[st.inbounder], r = st.reset[I.g];
      if (len(I.x - r[0], I.y - r[1]) < 0.4 || st.t >= st.deadFor + 150) {
        I.x = r[0]; I.y = r[1];
        for (const P of st.p) { if (P.act?.kind !== "dunk") P.act = null; }
        const keep = st.keepShot, sc = st.shot;
        st.phase = "live";
        st.poss = -1;
        giveBall(st, I);
        if (keep) st.shot = sc;
        st.keepShot = false;
        if (st.half) { st.clear = -1; say(st, "check", I); } else st.ev.push("inbound");
      }
    }
  }
  return st;
}

export function resultOf(st) {
  const s = st.score;
  return {
    done: st.phase === "over", winner: st.phase === "over" ? (s[0] > s[1] ? 0 : 1) : null, score: [...s], periods: st.q, frames: st.frame, pts: [...st.pts],
    fga: [...st.fga], fgm: [...st.fgm], tpa: [...st.tpa], tpm: [...st.tpm], fta: [...st.fta], ftm: [...st.ftm], fouls: [...st.fouls], tov: [...st.tov],
  };
}
export function replay(rec) {
  if (rec.version !== VERSION) throw new Error(`hoops record version ${rec.version}, sim ${VERSION}`);
  const st = newGame(rec.seed, rec.cfg);
  const log = rec.inputLog;
  for (let k = 0; k < log.length; k += 2) for (let n = 0; n < log[k + 1]; n++) step(st, log[k]);
  return resultOf(st);
}

// For the checks only: put the ball in a player's hands at (x, y), live, with the clocks set.
export function setUp(st, g, x, y, { shot = null, clock = null } = {}) {
  const P = st.p[g];
  for (const Q of st.p) { Q.act = null; Q.z = 0; Q.vz = 0; Q.jumpAt = -1; Q.stumble = 0; Q.cool = 0; }
  P.x = x; P.y = y; st.phase = "live"; st.t = 0;
  giveBall(st, P);
  st.clear = -1;
  P.caught = -999;
  if (shot != null) st.shot = shot;
  if (clock != null) st.clock = clock;
  return st;
}
// For the checks only: a release from where the player stands, its outcome forced.
export function forceShot(st, g, made) {
  const P = st.p[g];
  P.act = { kind: "jump", f: TOP };
  release(st, P, 0);
  st.ball.made = made; st.ball.air = false; st.ball.fouled = null;
  return st;
}
// For the checks only: send a player to the line for n shots.
export function forceFreeThrows(st, g, n) { toLine(st, st.p[g], n, 10); return st; }
