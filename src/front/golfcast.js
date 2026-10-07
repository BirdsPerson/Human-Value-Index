// THE TOURNAMENT channel's player (TourneyChannel.jsx): re-plays a verified golf card on the pure sim, a few
// ticks at a time, so the browser can draw it as it goes. The same stepping as sim.js replay(), cut into
// pieces: a [bits, count] pair is held for `count` ticks, an [event, 0] pair is an act between ticks. Dead air
// (the golfer thinking at the aim, bits 0) runs six times faster than the clock: a few shots a minute is the
// pace, not four minutes of standing still. Pure (no DOM): scripts/check-desk.mjs runs it.
import { newRound, step, act, cardOf, holeOf, VERSION } from "../play/golf/sim.js";
import { bug } from "./board.js";

export const IDLE_FAST = 6;
export function makeCast(rec) {
  const log = rec.inputLog, st = newRound({ ...rec.cfg, v: VERSION });
  let i = 0, left = null, spent = 0, over = false;
  const total = (() => { let t = 0; for (let k = 0; k < log.length; k += 2) if (typeof log[k] === "number") t += log[k + 1]; return t; })();
  // advance by `n` ticks of the broadcast clock -> the sim ticks actually run
  function advance(n) {
    let used = 0, ran = 0;
    while (used < n && st.phase !== "done" && !over) {
      if (i < log.length && typeof log[i] !== "number") { act(st, log[i]); i += 2; continue; }
      let bits = 0;
      if (i < log.length) { if (left == null) left = log[i + 1]; bits = log[i]; }
      step(st, bits); st.ev.length = 0; ran++; spent++;
      used += bits === 0 && st.phase === "aim" ? 1 / IDLE_FAST : 1;
      if (i < log.length && --left <= 0) { i += 2; left = null; }
      if (i >= log.length && spent > total + 4000) over = true;   // a log that never finishes the round
    }
    return ran;
  }
  function info() {
    const c = cardOf(st), done = st.phase === "done" || over;
    const hole = done ? c.rows[c.rows.length - 1]?.n : holeOf(st).n;
    return { hole, toPar: c.toPar[0], played: c.played, done, text: done ? `FINAL · ${bug(hole, c.toPar[0]).split(" · ")[1]}` : bug(hole, c.toPar[0]), strokes: st.players[0].strokes };
  }
  return { st, advance, info, ticks: () => spent };
}
