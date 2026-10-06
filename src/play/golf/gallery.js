// The gallery round the green: how the crowd takes a shot, read off the round's state and never
// written back to it (pure, no DOM). Golf.jsx asks when a shot comes to rest and plays the sound
// (../crowdAudio.js) and says a line to the screen reader; render.js asks the same and moves the
// crowd. A replay sees the same reactions because it sees the same states.
//
// -> {kind, say} | null, where kind is one of
//   "roar"     a hole in one, an eagle or better, a holed shot from off the green, an approach to
//              a yard or so
//   "cheer"    an approach inside ten feet
//   "warm"     a holed birdie putt (or a long one for par)
//   "polite"   a holed putt for par
//   "thin"     a holed putt for bogey or worse: a few claps
//   "ooh"      a close call: a lip-out, a putt that dies on the edge, a long putt that just misses
//   "groan"    an approach that nearly dropped and ran on, a short putt missed
//   "crickets" a shank, the water, out of bounds, a three-putt, a double bogey or worse, a missed
//              tap-in: nothing, or a cough
import { CLUBS } from "./sim.js";

const SAY = {
  roar: "THE GALLERY ROARS.", cheer: "THE GALLERY CHEERS.", warm: "WARM APPLAUSE.", polite: "POLITE APPLAUSE.",
  thin: "A FEW CLAPS.", ooh: "THE GALLERY GASPS.", groan: "THE GALLERY GROANS.", crickets: "SILENCE. SOMEONE COUGHS.",
};
const r = (kind) => ({ kind, say: SAY[kind] });

// st: the round, just as a shot has come to rest (phase "rest", t small). h: its hole.
export function reactionFor(st, h) {
  const P = st.players[st.cur], s = st.shot;
  if (!s || !P) return null;
  const toPin = Math.hypot(h.pin.x - P.x, h.pin.y - P.y);
  if (s.shank) return r("crickets");
  if (s.splash) return r("crickets");
  if (P.holed && P.strokes >= 10) return r("crickets");
  if (P.holed && toPin < 0.01) {
    const d = P.strokes - h.par;
    if (P.strokes === 1 || d <= -2) return r("roar");
    if (!s.putt) return r("roar");                       // a chip-in, a hole-out from the fairway
    if (P.putts >= 3) return r("crickets");              // holed, at the third time of asking
    if (d >= 2) return r("crickets");
    if (d === -1) return r("warm");
    if (d === 0) return s.from > 8 ? r("warm") : r("polite");
    return r("thin");
  }
  if (s.putt) {
    if (P.putts >= 3) return r("crickets");              // a three-putt
    if (s.from < 1.0) return r("crickets");              // missed a tap-in
    if (s.lip || toPin < 0.2) return r("ooh");           // round the lip, or dead on the edge
    if (s.from > 8 && toPin < 0.7) return r("ooh");
    if (s.from < 3 && toPin > 0.5) return r("groan");
    return null;
  }
  if (P.lie === "green" || P.lie === "fringe") {
    if (s.lip) return r("groan");                         // it caught the hole and ran on
    if (toPin < 1.1) return r("roar");
    if (toPin < 3.4) return r("cheer");                   // inside ten feet
  }
  if (P.lie === "trees" || P.lie === "path") return null;
  return null;
}
// After a hole: a reaction to the card itself (a double bogey or worse: silence).
export function holeReaction(st, h, P) {
  if (P.strokes - h.par >= 2) return r("crickets");
  return null;
}
export const clubName = (i) => CLUBS[i]?.id || "";
