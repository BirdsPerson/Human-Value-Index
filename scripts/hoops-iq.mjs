// THE COURTS: the basketball-IQ meter (docs/design/BASKETBALL.md section 5). Watches any engine's state
// frame by frame from the outside (it reads only st.p, st.ball, st.ev, st.note, st.phase, st.poss, st.ctl,
// st.half, st.n), so the same meter reads the frozen v4 sim (the "before") and the live engine (the
// "after"). check-hoops.mjs turns its numbers into checks that can fail; run it alone to print both:
//   node scripts/hoops-iq.mjs            CPU v CPU on NBA-shaped fives and the ten real rosters, v4 and live
//   HOOPS_IQ_N=200 node scripts/hoops-iq.mjs
import { fileURLToPath } from "node:url";

// ---- roles: the all-five rule (4.5), computed from the outside so it reads a v4 game too ----------
const POS_BONUS = { PG: 8, SG: 4 };
export const handleScore = (P) => 0.6 * P.R.handle + 0.4 * P.R.pass + (POS_BONUS[P.pos] || 0);
export const isBig = (P) => P.pos === "C" || P.pos === "PF" || P.arch === "big";
export function handlersOf(st, t) {
  const team = st.p.filter(P => P.t === t).sort((a, b) => handleScore(b) - handleScore(a) || a.i - b.i);
  return team.slice(0, 2).map(P => P.g);
}

const MADE = new Set(["two", "three", "dunk", "alleyoop", "one", "streettwo"]);
// One game's meter. Call see(st) after every step; read() at the end.
export function iqMeter(st, { C, hx = 14.325 }) {
  const n = st.n, full = !st.half;
  const bh = [handlersOf(st, 0), handlersOf(st, 1)];
  const m = {
    poss: 0, pressedCalled: 0, backCalled: 0, carried: 0, carriedBH: 0, carriedBig: 0, makes: 0, throwIns: 0, throwBehind: 0, backPoss: 0, pressed: 0, pickUp: [],
    oob: [0, 0], oobHuman: 0, oobCpuHolder: 0, viol: {}, setFrames: 0, campFrames: 0, nnSum: 0, nnN: 0, tov: [0, 0], frames: 0,
  };
  let P0 = null;          // the possession being watched: {t, start, cause, crossed, pressed, picked, frame}
  let lastMade = -1, ctlT = -1, last = null;
  const prev = st.p.map(P => [P.x, P.y]);
  const laneT = new Array(st.p.length).fill(0);
  const inLane = (P, d) => Math.abs(P.y - C.cy) < C.laneHW && d * P.x > C.hx - 5.79 && Math.abs(P.x) <= C.hx;
  const dirT = (t) => (st.half ? 1 : t === 0 ? 1 : -1);
  return {
    see(st) {
      m.frames++;
      const b = st.ball, ev = st.ev || [];
      for (const e of ev) {
        if (MADE.has(e)) { lastMade = st.frame; m.makes += full ? 1 : 0; }
        if (e === "andone" || e === "toline" || e === "dreb" || e === "oreb" || e === "steal" || e === "intercept") lastMade = -1;   // not a throw-in after a make
        if (e === "oob") {
          const g = st.note?.g ?? -1, t = st.note?.team ?? -1;
          if (t >= 0) m.oob[t]++;
          if (g >= 0 && t === 0 && !st.cfg.auto && st.p[g].i === st.ctl) m.oobHuman++;
          else if (g >= 0) m.oobCpuHolder++;
        }
        if (["eightsec", "backcourt", "threesec", "fivesec"].includes(e)) { const t = st.note?.team ?? -1; const k = `${e}${t}`; m.viol[k] = (m.viol[k] || 0) + 1; }
      }
      const H = b.st === "held" && b.own >= 0 ? st.p[b.own] : null;
      const inbounding = H && (Math.abs(H.x) > C.hx || H.y < 0 || H.y > C.w);
      // team control: the ball held (in bounds), or a pass between teammates
      const ctl = H && !inbounding ? H.t : b.st === "pass" && b.from >= 0 ? st.p[b.from].t : -1;
      // a throw-in after a make: the first pass after the make, thrown from where?
      if (full && lastMade >= 0 && b.st === "pass" && b.f <= 1 && last !== "pass") {
        m.throwIns++;
        const F = st.p[b.from];
        if (Math.abs(F.x) > C.hx) m.throwBehind++;
        lastMade = -1;
      } else if (full && lastMade >= 0 && H && !inbounding && st.phase === "live" && last === "dead") {
        // v4: the ball appears live in a player's hands on the floor, no throw
        m.throwIns++; lastMade = -1;
      }
      if (ctl >= 0 && ctl !== ctlT) {
        // a new possession: by a make (the other side's throw-in) or a defensive rebound
        const cause = ev.includes("dreb") ? "dreb" : st.frame - (P0?.madeAt ?? -999) < 400 || ev.includes("inbound") ? "make" : ev.includes("steal") || ev.includes("intercept") ? "steal" : "other";
        P0 = { t: ctl, cause, start: st.frame, crossed: false, pressed: false, picked: false, deep: 0 };
        m.poss++;
      }
      if (ev.some(e => MADE.has(e))) { if (P0) P0.madeAt = st.frame; }
      if (ctl >= 0) ctlT = ctl;
      if (P0 && full && H && !inbounding && H.t === P0.t && st.phase === "live") {
        const d = dirT(H.t), back = d * H.x < 0;
        if ((P0.cause === "make" || P0.cause === "dreb") && !P0.crossed && d * H.x > 0.15) {
          P0.crossed = true; m.carried++;
          if (bh[H.t].includes(H.g)) m.carriedBH++;
          if (isBig(H) && !bh[H.t].includes(H.g)) m.carriedBig++;
        }
        // the possessions a press can be measured on: half a second deep in the backcourt, past the scramble
        if (d * H.x < -2 && !(P0.cause !== "make" && st.frame - P0.start < 90) && ++P0.deep === 30) { P0.bucket = st.press?.[1 - H.t] ? "called" : "off"; if (P0.bucket === "called") m.backCalled++; else m.backPoss++; }
        // the defence: a defender closing on the handler while the handler is not moving toward him
        const hv = [(H.x - prev[H.g][0]) * 60, (H.y - prev[H.g][1]) * 60];
        for (const D of st.p) {
          if (D.t === H.t) continue;
          const dx = H.x - D.x, dy = H.y - D.y, k = Math.sqrt(dx * dx + dy * dy) || 1e-6;
          if (k > 1.5) continue;
          const dv = [(D.x - prev[D.g][0]) * 60, (D.y - prev[D.g][1]) * 60];
          const dIn = (dv[0] * dx + dv[1] * dy) / k, hIn = -(hv[0] * dx + hv[1] * dy) / k;
          const excusedAll = P0.cause !== "make" && st.frame - P0.start < 90;   // a live-ball change of possession (a board, a steal, a loose ball): the scramble, not a press

          // the press: a defender on him (within 1.5 m), not running back, for half a second while he is more
          // than 2 m deep in his own backcourt (with no press the defence waits at half court and the arc)
          // (another man running back toward his own basket past him is getting back, not pressing)
          const back2 = st.mark[D.g] !== H.g && d * dv[0] > 1.0;
          if (d * H.x < -2 && !excusedAll && !back2) { P0.on = (P0.on || 0) + 1; if (P0.on >= 30 && P0.bucket && !P0.pressed) { P0.pressed = true; if (P0.bucket === "called") m.pressedCalled++; else m.pressed++; if (process.env.IQ_DEBUG) console.log("press", st.frame - P0.start, P0.cause, st.mark[D.g] === H.g ? "marker" : "other", k.toFixed(2), (d * H.x).toFixed(1), JSON.stringify(st.press || null)); } }
          // the pick-up: the first place his own defender is on him (within 1.5 m, not by his doing)
          if (!P0.picked && !excusedAll && hIn <= 0.5 && st.mark[D.g] === H.g) { P0.picked = true; m.pickUp.push(Math.sqrt((d * C.rimX - H.x) ** 2 + (C.cy - H.y) ** 2)); }
        }
      }
      // the set: team control in the frontcourt; nobody camps in the lane, and the spacing
      if (ctl >= 0 && st.phase === "live") {
        const d = dirT(ctl), Hc = H || (b.st === "pass" ? st.p[b.from] : null);
        if (Hc && (st.half || d * Hc.x > 0)) {
          m.setFrames++;
          let camp = false;
          const mates = st.p.filter(P => P.t === ctl);
          for (const P of mates) { laneT[P.g] = inLane(P, d) ? laneT[P.g] + 1 : 0; if (laneT[P.g] >= 150) camp = true; }
          if (camp) m.campFrames++;
          if (mates.length > 1) for (const P of mates) { let nn = 1e9; for (const Q of mates) if (Q !== P) nn = Math.min(nn, Math.hypot(P.x - Q.x, P.y - Q.y)); m.nnSum += nn; m.nnN++; }
        } else for (const P of st.p) laneT[P.g] = 0;
      } else if (b.st === "shot" || b.st === "dead") for (const P of st.p) laneT[P.g] = 0;
      for (const P of st.p) { prev[P.g][0] = P.x; prev[P.g][1] = P.y; }
      last = st.phase === "live" ? b.st : st.phase;
    },
    read() { return m; },
  };
}
export function sumMeters(ms) {
  const t = {};
  for (const m of ms) for (const [k, v] of Object.entries(m)) {
    if (k === "pickUp") t[k] = (t[k] || []).concat(v);
    else if (Array.isArray(v)) t[k] = (t[k] || v.map(() => 0)).map((x, i) => x + v[i]);
    else if (typeof v === "object") { t[k] = t[k] || {}; for (const [a, b] of Object.entries(v)) t[k][a] = (t[k][a] || 0) + b; }
    else t[k] = (t[k] || 0) + v;
  }
  return t;
}
export const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
export function iqLine(t, games) {
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1) : "-");
  return {
    games,
    bringUpBH: pc(t.carriedBH, t.carried), bringUpBig: pc(t.carriedBig, t.carried),
    throwInBehind: pc(t.throwBehind, t.throwIns), pressedPoss: pc(t.pressed, t.backPoss), pressedCalled: pc(t.pressedCalled, t.backCalled), pickUpMedian: median(t.pickUp).toFixed(2),
    oobPerGameCpuHolder: (t.oobCpuHolder / games).toFixed(2), oobPerGameHuman: (t.oobHuman / games).toFixed(2),
    laneCamp: pc(t.campFrames, t.setFrames), spacing: (t.nnSum / (t.nnN || 1)).toFixed(2), viol: t.viol,
  };
}

// The real rosters: the league's fallback fives as the page builds them (positions from ROLES).
export function realFive(R, id) {
  return R.sortFive(R.FALLBACK.teams[id]).map(([k, n, r]) => { const pos = R.ROLES[k] || null; return [k, R.shownName(n), r, pos ? { PG: "guard", SG: "guard", SF: "wing", PF: "slasher", C: "big" }[pos] : null, pos, null]; });
}
export const NBA5 = (p, base) => [[p + "g", "G", base + 6, "guard"], [p + "w", "W", base + 3, "wing"], [p + "s", "S", base, "slasher"], [p + "w2", "W2", base - 2, "wing"], [p + "b", "B", base + 2, "big"]];

// N CPU v CPU games on an engine: half NBA-shaped fives, half real rosters in rotation.
export function cpuIQ(S, R, N = 60, seed0 = 7100) {
  const ms = [];
  for (let k = 0; k < N; k++) {
    const ids = R.TEAM_IDS, real = k % 2 === 1;
    const home = real ? realFive(R, ids[k % ids.length]) : NBA5("a" + k, 74 + (k % 5)), away = real ? realFive(R, ids[(k * 3 + 1) % ids.length]) : NBA5("b" + k, 74 + ((k * 3) % 5));
    const st = S.newGame(seed0 + k, { auto: true, home, away });
    const M = iqMeter(st, { C: S.COURT });
    for (let f = 0; st.phase !== "over" && f < 200000; f++) { S.step(st, 0); M.see(st); }
    ms.push(M.read());
  }
  return sumMeters(ms);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const R = await import("../src/play/hoops/roster.js");
  const RP = await import("../src/play/hoops/replay.js");
  const live = await import("../src/play/hoops/engine/index.js");
  const N = Number(process.env.HOOPS_IQ_N) || 60;
  for (const [name, S] of [["v4", RP.simOf(4)], [`live v${live.VERSION}`, live]]) {
    const t0 = Date.now(), t = cpuIQ(S, R, N);
    console.log(name, JSON.stringify(iqLine(t, N)), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
