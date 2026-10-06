// THE LANES: ten-pin scoring. Pure. A game is a list of balls per player: each ball is
// {n: pins knocked down that counted, foul: bool, split: bool (a split left after a first ball)}.
//
// The rules (USBC): ten frames; a frame is two balls unless the first is a STRIKE (all ten). A strike
// scores 10 plus the next two balls; a SPARE (ten with the frame's two balls) 10 plus the next ball;
// an open frame its pins. The tenth frame gives the bonus balls in the frame itself: a strike earns
// two more, a spare one more, so it holds up to three balls (a fresh rack after each mark). A FOUL
// (over the line) counts the delivery and none of its pins: an F on the sheet, a 0 in the count.

// Who stands in what rack, by pin number 1..10. The triangle from the bowler: 7 8 9 10 at the back,
// the 1 (head pin) in front. PIN_SPOTS in sim.js; here only the neighbours, for splits.
export const NEIGHBOURS = {
  1: [2, 3], 2: [1, 3, 4, 5], 3: [1, 2, 5, 6], 4: [2, 5, 7, 8], 5: [2, 3, 4, 6, 8, 9],
  6: [3, 5, 9, 10], 7: [4, 8], 8: [4, 5, 7, 9], 9: [5, 6, 8, 10], 10: [6, 9],
};
// A split: the head pin down after the first ball, and the pins left standing in two or more groups
// with a gap between them (7-10, 4-6, 5-7, the "baby splits" 2-7 and 3-10).
export function isSplit(standing) {
  const S = new Set(standing);
  if (S.has(1) || S.size < 2) return false;
  const seen = new Set(), stack = [standing[0]];
  while (stack.length) { const p = stack.pop(); if (seen.has(p)) continue; seen.add(p); for (const q of NEIGHBOURS[p]) if (S.has(q) && !seen.has(q)) stack.push(q); }
  return seen.size < S.size;
}

// Balls -> frames: [{balls: [ball...], marks: ["X" | "/" | "-" | "F" | "7"...], score: running total or
// null (not yet known), done: bool}] x 10, and the total so far.
export function frames(balls) {
  const out = [];
  let i = 0;
  for (let f = 0; f < 10; f++) {
    const fr = { balls: [], marks: [], score: null, done: false, split: false };
    if (f < 9) {
      const a = balls[i];
      if (a) {
        fr.balls.push(a);
        if (a.n === 10) { fr.done = true; fr.marks.push("X"); i += 1; }
        else {
          fr.marks.push(markOf(a)); fr.split = !!a.split;
          const b = balls[i + 1];
          if (b) { fr.balls.push(b); fr.done = true; fr.marks.push(a.n + b.n === 10 && !b.foul ? "/" : markOf(b)); i += 2; } else i += 1;
        }
      }
    } else {
      // the tenth: up to three balls, a fresh rack after a strike or a spare
      const T = balls.slice(i, i + 3); i += T.length;
      const [b1, b2, b3] = T;
      if (b1) { fr.balls.push(b1); fr.marks.push(b1.n === 10 ? "X" : markOf(b1)); fr.split = !!b1.split; }
      if (b2) { fr.balls.push(b2); fr.marks.push(b1.n === 10 ? (b2.n === 10 ? "X" : markOf(b2)) : (b1.n + b2.n === 10 && !b2.foul ? "/" : markOf(b2))); }
      const third = b1 && b2 && (b1.n === 10 || b1.n + b2.n === 10);
      if (b3 && third) {
        fr.balls.push(b3);
        const fresh = b2.n === 10 || b1.n < 10;   // after X X, or after a spare
        fr.marks.push(fresh ? (b3.n === 10 ? "X" : markOf(b3)) : (b2.n + b3.n === 10 && !b3.foul ? "/" : markOf(b3)));
      } else if (b3) i -= 1;
      fr.done = fr.balls.length === 3 || (fr.balls.length === 2 && !third);
    }
    out.push(fr);
  }
  // the running score: a frame is scored once its bonus balls are thrown
  const flat = balls.map(b => b.n);
  let total = 0, k = 0, known = true;
  for (let f = 0; f < 10; f++) {
    const fr = out[f];
    if (!fr.balls.length) { known = false; break; }
    let add = null;
    if (f < 9) {
      if (fr.marks[0] === "X") add = flat[k + 1] != null && flat[k + 2] != null ? 10 + flat[k + 1] + flat[k + 2] : null;
      else if (fr.balls.length === 2) add = fr.marks[1] === "/" ? (flat[k + 2] != null ? 10 + flat[k + 2] : null) : fr.balls[0].n + fr.balls[1].n;
      k += fr.balls.length;
    } else if (fr.done) add = fr.balls.reduce((a, b) => a + b.n, 0);
    if (add == null || !known) { known = false; continue; }
    total += add; fr.score = total;
  }
  const last = out.reduce((s, fr) => (fr.score != null ? fr.score : s), 0);
  return { frames: out, total: last, over: out[9].done };
}
const markOf = (b) => (b.foul ? "F" : b.n === 0 ? "-" : String(b.n));

// The frame a player is on, and the ball within it (for the turn order and the rack).
// -> {frame 0..9, ball 0..2, rackFresh: does this ball face a full rack}
export function position(balls) {
  const { frames: F } = frames(balls);
  for (let f = 0; f < 10; f++) {
    const fr = F[f];
    if (fr.done) continue;
    const n = fr.balls.length;
    if (f < 9) return { frame: f, ball: n, rackFresh: n === 0 };
    // the tenth: a fresh rack on ball 1, after a strike, and after a spare
    const [b1, b2] = fr.balls;
    const fresh = n === 0 || (n === 1 && b1.n === 10) || (n === 2 && (b1.n === 10 ? b2.n === 10 : b1.n + b2.n === 10));
    return { frame: 9, ball: n, rackFresh: fresh };
  }
  return { frame: 10, ball: 0, rackFresh: true, over: true };
}

// The best a game can still finish at (the monitor's MAX column)
export function maxPossible(balls) {
  const add = [];
  for (let k = 0; k < 21; k++) {
    const t = [...balls, ...add];
    const p = position(t);
    if (p.over) break;
    const { frames: F } = frames(t);
    const fr = F[p.frame];
    if (p.frame < 9) add.push({ n: p.ball === 0 ? 10 : 10 - fr.balls[0].n });
    else add.push({ n: p.rackFresh ? 10 : 10 - fr.balls[p.ball - 1].n });
  }
  return frames([...balls, ...add]).total;
}

// For the newspaper's sports page: the small results shape of a finished game (verified by replay).
export function lineOf(balls) {
  const { frames: F, total } = frames(balls);
  const strikes = F.reduce((a, fr) => a + fr.marks.filter(m => m === "X").length, 0);
  const spares = F.reduce((a, fr) => a + fr.marks.filter(m => m === "/").length, 0);
  return { total, strikes, spares, marks: F.map(fr => fr.marks.join("")), splits: F.filter(fr => fr.split).length };
}
