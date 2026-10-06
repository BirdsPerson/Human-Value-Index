// THE OPEN TOURNAMENTS' replay check (docs/TOURNAMENTS.md): one ADAPTER per game, each re-playing a
// filed leg in node on the game's own pure sim, from the event's locked setup (src/tournament/rules.js),
// never from anything the browser says about the setup. A leg is accepted only when the re-play
// finishes exactly as claimed.
//
// THE ADAPTER INTERFACE (a new game joins with one of these and a calendar entry):
//   game            the event's game key (calendar.js)
//   logTicks(log)   the play the log holds, in the sim's ticks (the server's clock check)
//   hz              the sim's ticks per second
//   verify(ev, leg, div, sub)
//                   sub: {inputLog, claim, opts}  (opts: the player's own equipment, e.g. a ball)
//                   -> {ok: true, leg: {total, tb: [..., lower first], detail, par?, ticks}}
//                    | {ok: false, error}
//   lower           true when the lower total wins (golf); bowling, the derby and the hunt are higher
// Implemented: golf (THE DEPARTMENT LINKS, replay.js picks the sim version), bowling (THE LANES), fish
// (THE WATERS: a derby is one catch, the aquarium's own check), and the two that only need a calendar
// entry to run: hunt (TAGGED OUT, verifyHunt) and ski (THE MOUNTAIN's challenges, a fixed start).
import * as GOLF from "../../src/play/golf/sim.js";
import { replayRecord } from "../../src/play/golf/replay.js";
import * as BOWL from "../../src/play/bowling/sim.js";
import { frames as bowlFrames } from "../../src/play/bowling/score.js";
import * as FISH from "../../src/play/fish/sim.js";
import { verifyCatchV, versionOf } from "../../src/play/fish/replay.js";
import { SPECIES_BY } from "../../src/play/fish/data.js";
import * as HUNT from "../../src/play/hunt/sim.js";
import * as SKI from "../../src/play/ski/sim.js";
import { CHALLENGE, LOWER_BETTER } from "../../src/play/ski/challenges.js";
import { golfCfg, bowlCfg, fishCfg, countback } from "../../src/tournament/rules.js";
import { seedOf } from "../../src/tournament/calendar.js";

export const MAX_LOG = 200_000;
const int = (v) => Number.isInteger(v);
const no = (error) => ({ ok: false, error });
const SAME = "THE DEPARTMENT RE-PLAYED YOUR CARD. IT CAME OUT DIFFERENTLY. THE BOARD IS FOR WHAT HAPPENED.";

// ---- golf ------------------------------------------------------------------------------------------
// The log: [bits, count] pairs, and (v3) [event, 0] pairs between them; an event is a short array of a
// letter and integers (sim.js act).
function golfLogOk(log) {
  if (!Array.isArray(log) || !log.length || log.length % 2 || log.length > MAX_LOG) return false;
  for (let i = 0; i < log.length; i += 2) {
    const a = log[i], n = log[i + 1];
    if (Array.isArray(a)) { if (n !== 0 || a.length < 2 || a.length > 6 || !["a", "s", "p"].includes(a[0]) || !a.slice(1).every(x => int(x) && Math.abs(x) < 1e7)) return false; }
    else if (!int(a) || a < 0 || a > 63 || !int(n) || n < 1 || n > 1e6) return false;
  }
  return true;
}
const golfTicks = (log) => { let t = 0; for (let i = 0; i < log.length; i += 2) if (typeof log[i] === "number") t += log[i + 1]; return t; };
export const golf = {
  game: "golf", lower: true, hz: GOLF.HZ, logTicks: golfTicks,
  verify(ev, leg, div, { inputLog, claim, v, opts }) {
    if (leg !== 0) return no("A ROUND OF GOLF IS ONE CARD.");
    if (v != null && Number(v) !== GOLF.VERSION) return no("THAT CARD WAS PLAYED ON ANOTHER VERSION OF THE COURSE. RELOAD AND PLAY IT AGAIN.");
    if (!golfLogOk(inputLog)) return no("THE CARD'S LOG IS NOT LEGIBLE.");
    if (!claim || !int(claim.total) || !Array.isArray(claim.holes)) return no("THE CLAIM IS NOT LEGIBLE: A TOTAL AND THE HOLES.");
    const cfg = { ...golfCfg(ev, div, null, { hand: opts?.hand === "L" ? "L" : "R" }), v: GOLF.VERSION };   // a left-hander's card re-plays left-handed
    let st;
    try { st = replayRecord({ cfg, inputLog }, golfTicks(inputLog) + 2000); } catch { return no("THE CARD COULD NOT BE RE-PLAYED."); }
    if (st.phase !== "done" || !st.result) return no("THE RE-PLAY DID NOT FINISH THE ROUND. THE DEPARTMENT FILES FINISHED CARDS.");
    const r = st.result, holes = r.holes.map(h => h.s[0]);
    if (r.total[0] !== claim.total || holes.length !== claim.holes.length || holes.some((s, i) => s !== claim.holes[i])) return no(SAME);
    return { ok: true, leg: { total: r.total[0], par: r.par, tb: countback(holes), detail: holes, ticks: st.tick } };
  },
};

// ---- bowling -----------------------------------------------------------------------------------------
// The log: [mask, count] runs with event objects ({t: "set" | "throw", numbers}) between them (sim.js Logger).
function bowlLogOk(log) {
  if (!Array.isArray(log) || !log.length || log.length > MAX_LOG) return false;
  for (let i = 0; i < log.length;) {
    const x = log[i];
    if (x && typeof x === "object" && !Array.isArray(x)) {
      if (!["set", "throw"].includes(x.t) || Object.keys(x).length > 8 || !Object.entries(x).every(([k, v]) => k === "t" || (k === "foul" ? typeof v === "boolean" : typeof v === "number" && Number.isFinite(v)))) return false;
      i++; continue;
    }
    if (!int(x) || x < 0 || x > 63 || !int(log[i + 1]) || log[i + 1] < 1 || log[i + 1] > 1e6) return false;
    i += 2;
  }
  return true;
}
const bowlTicks = (log) => { let t = 0; for (let i = 0; i < log.length;) { if (typeof log[i] === "number") { t += log[i + 1]; i += 2; } else i++; } return t; };
export const bowling = {
  game: "bowling", lower: false, hz: BOWL.HZ, logTicks: bowlTicks,
  verify(ev, leg, div, { inputLog, claim, opts, v }) {
    if (!int(leg) || leg < 0 || leg >= ev.legs) return no("NO SUCH GAME IN THIS SERIES.");
    if (v != null && Number(v) !== BOWL.VERSION) return no("THAT GAME WAS BOWLED ON ANOTHER VERSION OF THE LANES.");
    if (!bowlLogOk(inputLog)) return no("THE GAME'S LOG IS NOT LEGIBLE.");
    if (!claim || !int(claim.total)) return no("THE CLAIM IS NOT LEGIBLE: A TOTAL.");
    const cfg = bowlCfg(ev, leg, div, opts || {}, BOWL.VERSION);
    let r;
    try { r = BOWL.replay({ cfg, inputLog }, bowlTicks(inputLog) + 10); } catch { return no("THE GAME COULD NOT BE RE-PLAYED."); }
    if (!r.over) return no("THE RE-PLAY DID NOT FINISH TEN FRAMES. THE DEPARTMENT FILES FINISHED GAMES.");
    const p = r.players[0];
    if (p.total !== claim.total) return no(SAME);
    const strikes = bowlFrames(p.balls.map(([n, f, s]) => ({ n, foul: !!f, split: !!s }))).frames.filter(f => f.marks?.[0] === "X").length;
    return { ok: true, leg: { total: p.total, tb: [-p.total, -strikes], detail: { strikes }, ticks: r.ticks } };
  },
};

// ---- fish: a derby is one catch, checked exactly as the aquarium checks a donation ----------------------
export const fish = {
  game: "fish", lower: false, hz: FISH.HZ, logTicks: FISH.logTicks,
  verify(ev, leg, div, { inputLog, claim, n, v }) {
    if (leg !== 0) return no("A DERBY IS ONE FISH.");
    const simV = versionOf({ v: v ?? FISH.VERSION });   // the one-button sim (2) or EXPERT (1): the same water either way
    if (!simV) return no("THE DERBY KNOWS NO SUCH WAY OF FISHING.");
    if (!Number.isInteger(n) || n < 0 || n > 500) return no("WHICH FISH? THE CATCH NUMBER IS NOT LEGIBLE.");
    if (!claim || typeof claim.sp !== "string" || !SPECIES_BY[claim.sp] || !int(claim.cw) || !int(claim.tl)) return no("THE CLAIM IS NOT LEGIBLE: SPECIES, WEIGHT, LENGTH.");
    if (!Array.isArray(inputLog) || inputLog.length > MAX_LOG) return no("THE LOG IS LONGER THAN ANY TRIP.");
    const r = verifyCatchV(simV, fishCfg(ev), inputLog, n, claim, { maxTicks: FISH.TRIP_TICKS });
    if (!r.ok) return r;
    return { ok: true, leg: { total: r.catch.cw, tb: [-r.catch.tl], detail: { sp: r.catch.sp, cw: r.catch.cw, tl: r.catch.tl, v: simV }, ticks: r.ticks } };
  },
};

// ---- hunt and ski: ready for a calendar entry ----------------------------------------------------------
// hunt: ev.cond = {trip}; everyone shoots the event's seed from the event's opening clock.
export const hunt = {
  game: "hunt", lower: false, hz: HUNT.HZ, logTicks: HUNT.logTicks,
  verify(ev, leg, div, { inputLog, claim }) {
    if (leg !== 0) return no("A HUNT IS ONE TRIP.");
    const v = HUNT.verifyHunt({ v: HUNT.VERSION, seed: seedOf(ev.id, 0), trip: ev.cond.trip, at: ev.opens }, inputLog, claim);
    return v.ok ? { ok: true, leg: { total: v.result.score, tb: [], detail: null, ticks: v.ticks } } : v;
  },
};
// ski: ev.cond = {ch, board}; a challenge has one fixed start, so no seed. lower follows the challenge.
export const ski = {
  game: "ski", hz: SKI.HZ, logTicks: SKI.logTicks,
  lowerOf: (ev) => LOWER_BETTER(CHALLENGE[ev.cond.ch]),
  verify(ev, leg, div, { inputLog, claim }) {
    if (leg !== 0 || !CHALLENGE[ev.cond?.ch]) return no("NO SUCH RUN.");
    if (!Array.isArray(inputLog) || !inputLog.length || inputLog.length % 2 || inputLog.length > MAX_LOG || !inputLog.every(x => int(x) && x >= 0)) return no("THE RUN'S LOG IS NOT LEGIBLE.");
    let out;
    try { out = SKI.replay({ v: SKI.VERSION, ch: ev.cond.ch, board: Boolean(ev.cond.board), inputLog }); } catch { return no("THE RUN COULD NOT BE RE-PLAYED."); }
    if (out?.res?.value == null) return no("THE RE-PLAY DID NOT FINISH THE CHALLENGE.");
    if (!claim || out.res.value !== claim.value) return no(SAME);
    return { ok: true, leg: { total: out.res.value, tb: [], detail: null, ticks: out.ticks } };
  },
};

export const ADAPTERS = { golf, bowling, fish, hunt, ski };
export const adapterOf = (ev) => ADAPTERS[ev?.game] || null;
