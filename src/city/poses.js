// Small activity loops made from a person's own sprite: no new art, no generation. The
// face and outfit stay theirs; the job comes from how the sheet is cut and moved.
//   sit    the torso lowered onto the seat, shins below it (legs folded, seen from the front)
//   lie    the whole sprite on its back across a bunk, blanket over the legs
//   walk   the sheet's walk frame, pacing the anchor's range, pausing at each end
//   stand  as drawn, with the act's own motion: a bob, a lean, a lift, a turn
// plus a tiny overlay where the act has a tool: a glass, a bottle, keys, a brush, a
// barbell, a book, a note, a Z. Deterministic: the loop runs on the clock and a phase
// hashed from the person, so everyone is at a different point in it. t = 0 (reduced
// motion) gives each pose at rest.

import { SPRITE_W as FW, SPRITE_H as FH, statureOf } from "../sprites.js";

// A person's stature in a room cutaway: to scale, but never through the ceiling. footY is the
// anchor's feet measured from the room's top edge, hh the anchor's standing sprite height.
export function fitStature(s, footY, hh) {
  const k = statureOf(s);
  return k <= 1 || !(hh > 0) ? k : Math.min(k, Math.max(1, (footY - 2) / hh));
}

const HIP = 27;    // sprite rows kept above the seat
const SHIN = 38;   // sprite rows from here down are the lower legs
const SEAT = FH - SHIN;   // a seat is this many sprite rows off the floor

const SIT = new Set(["drink", "eat", "talk", "read", "write", "listen", "pray", "watch", "gamble", "type", "trade", "count", "piano", "judge", "rest", "sit"]);
// a worker at somebody else's seat stands at it (sitting acts on a seat anchor only)
const WALK = new Set(["shelve", "tend", "sprint", "stroll", "patrol", "patch", "sweep"]);
export const poseOf = (a, act) => (act === "sleep" ? "lie" : a.walk && WALK.has(act) ? "walk" : SIT.has(act) && (act === a.act || a.kind === "seat" || a.kind === "bed") ? "sit" : "stand");

function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
export function phaseOf(key) { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }
const frac = (v) => ((v % 1) + 1) % 1;
// on for `duty` of every `period` seconds
const every = (t, period, duty, ph) => frac(t / period + ph) < duty;

function blit(c, img, fi, sy, sh, x, y, w, h, flip) {
  if (flip) {
    c.save(); c.translate(Math.round(x + w), 0); c.scale(-1, 1);
    c.drawImage(img, fi * FW, sy, FW, sh, 0, Math.round(y), Math.round(w), Math.round(h));
    c.restore();
  } else c.drawImage(img, fi * FW, sy, FW, sh, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Draw one person at an anchor. x, y: the anchor's feet in canvas px; hh: the drawn height
// of a standing sprite at the anchor's scale; k: the person's stature (sprites.statureOf),
// which grows them from the feet while furniture (seat, bunk) stays the anchor's size;
// face: 1 turned right, -1/0 as drawn (the sprites face left).
// -> the box that was drawn, for hit-testing: [x0, y0, x1, y1] (and the walker's x).
export function drawPose(c, sheet, a, act, x, y, hh0, t, ph, k = 1) {
  const img = sheet.img, frames = sheet.frames || 1;
  const bp = hh0 / FH, hh = hh0 * k;          // bp: one sprite pixel at the furniture's scale
  const f = hh / FH, ww = FW * f, px = f;   // one sprite pixel of this person
  let pose = poseOf(a, act);
  let flip = a.face === 1;
  let dx = 0, dy = 0, fi = 0;
  try {
    if (pose === "walk") {
      // pace the range: walk 70% of a leg, pause 30% at each end (a look at the work)
      const [x0, x1] = a.walk, span = Math.max(1, x1 - x0);
      const period = 2 * (span / (14 * f) + 1.6);
      const u = frac(t / period + ph);
      const leg = u < 0.5 ? u * 2 : (u - 0.5) * 2;
      const k = Math.min(1, leg / 0.7);
      const pos = u < 0.5 ? k : 1 - k;
      dx = x0 - a.x + span * pos;
      const moving = leg < 0.7 && t > 0;
      flip = u < 0.5;
      if (moving && frames > 1) { const st = Math.floor(t * 6 + ph * 10); fi = st % 2; dy = st % 2 ? -px : 0; }
      else pose = "stand";
    }
    if (pose === "lie") {
      // on the bunk: head to the left, the blanket over the legs, a Z now and then
      const top = y - 9 * bp;
      c.save();
      c.translate(Math.round(x + hh * 0.5), Math.round(top + 11 * bp - 16 * px));   // the body rests on the mattress however big
      c.rotate(-Math.PI / 2);
      c.drawImage(img, 0, 0, FW, FH, Math.round(-ww / 2), Math.round(-hh), Math.round(ww), Math.round(hh));
      c.restore();
      const bx = x - hh * 0.5;
      R(c, "#4b5a78", bx + hh * 0.3, top - 8 * px, hh * 0.68, 7 * px);
      R(c, "#3b4a66", bx + hh * 0.3, top - 8 * px, hh * 0.68, px);
      if (t > 0) { const z = frac(t / 3 + ph); if (z < 0.6) zee(c, bx + hh * 0.08 + z * 8 * px, top - 16 * px - z * 12 * px, px, 1 - z); }
      else zee(c, bx + hh * 0.1, top - 18 * px, px, 0.8);
      return [bx, top - 12 * px, bx + hh, y];
    }
    const X = x + dx;
    if (pose === "sit") {
      // tiny motion: typing is a quick bob; the rest breathe, and now and then do the act
      let bob = 0;
      if (t > 0) {
        if (act === "type" || act === "trade" || act === "count") bob = every(t, 0.28, 0.5, ph) && !every(t, 7, 0.25, ph) ? -px : 0;
        else if (act === "piano") bob = every(t, 0.5, 0.5, ph) ? -px : 0;
        else if (act === "talk") bob = every(t, 0.6, 0.5, ph) && every(t, 5, 0.5, ph) ? -px : 0;
        else bob = every(t, 3.2, 0.5, ph) ? -px : 0;
        if (act === "trade" && every(t, 9, 0.12, ph)) bob = -3 * px;   // a hand up: SELL
      }
      const seatY = y - SEAT * bp;
      blit(c, img, 0, 0, HIP, X - ww / 2, seatY - HIP * px + bob, ww, HIP * px, flip);
      blit(c, img, 0, SHIN, FH - SHIN, X - ww / 2, seatY, ww, SEAT * bp, flip);   // shins span the seat's own height
      tool(c, act, X, seatY - HIP * px + bob, px, flip, t, ph, true);
      if (act === "talk" && t > 0 && every(t, 6, 0.3, ph)) dots(c, X + (flip ? 5 : -12) * px, seatY - HIP * px - 6 * px, px);
      return [X - ww / 2, seatY - HIP * px, X + ww / 2, y];
    }
    // standing
    if (t > 0 && pose !== "walk") {
      switch (act) {
        case "cheer": dy = every(t, 1.3, 0.25, ph) ? -3 * px : 0; break;
        case "lift": dy = every(t, 2, 0.5, ph) ? 2 * px : 0; break;
        case "run": fi = frames > 1 ? Math.floor(t * 8 + ph * 8) % 2 : 0; dy = fi ? -px : 0; break;
        case "punch": dx += every(t, 1.1, 0.2, ph) ? 2 * px * (flip ? 1 : -1) : 0; break;
        case "hammer": case "haul": case "sort": case "rake": case "dig": dy = every(t, 1, 0.35, ph) ? px : 0; break;
        case "perform": case "sing": dx += Math.round(Math.sin((t * 0.8 + ph) * Math.PI * 2)) * px; break;
        case "view": case "guide": case "confer": case "shout": case "coach": case "lecture": case "preach": case "speak":
          if (every(t, 7, 0.45, ph)) flip = !flip;
          dy = every(t, 2.4, 0.3, ph) ? -px : 0; break;
        default: dy = every(t, 3.5, 0.2, ph) ? -px : 0;
      }
    }
    const top = y + dy - hh;
    blit(c, img, fi, 0, FH, x + dx - ww / 2, top, ww, hh, flip);
    tool(c, act, x + dx, top, px, flip, t, ph, false);
    return [x + dx - ww / 2, top, x + dx + ww / 2, y];
  } catch {
    return [x - ww / 2, y - hh, x + ww / 2, y];   // sheet not decoded yet
  }
}

function zee(c, x, y, p, a) {
  c.fillStyle = `rgba(200,245,216,${Math.max(0, Math.min(1, a)).toFixed(2)})`;
  const s = Math.max(1, Math.round(p));
  c.fillRect(Math.round(x), Math.round(y), 4 * s, s); c.fillRect(Math.round(x + 2 * s), Math.round(y + s), s, s);
  c.fillRect(Math.round(x + s), Math.round(y + 2 * s), s, s); c.fillRect(Math.round(x), Math.round(y + 3 * s), 4 * s, s);
}
function dots(c, x, y, p) {
  R(c, "rgba(200,245,216,0.85)", x, y, 9 * p, 5 * p);
  R(c, "#0a0f0a", x + p, y + 2 * p, p, p); R(c, "#0a0f0a", x + 4 * p, y + 2 * p, p, p); R(c, "#0a0f0a", x + 7 * p, y + 2 * p, p, p);
}

// The tool in hand, where the act has one. top: the sprite's top row on the canvas.
function tool(c, act, x, top, p, flip, t, ph, seated) {
  const side = flip ? 1 : -1;            // the hand the sprite leads with
  const hx = x + side * 7 * p;           // hand, roughly
  const hy = top + (seated ? 20 : 24) * p;
  switch (act) {
    case "drink": {
      const up = t > 0 && every(t, 5, 0.18, ph);
      R(c, "#fbbf24", hx - p, up ? top + 10 * p : hy - 3 * p, 2 * p, 3 * p);
      R(c, "#e5e5e5", hx - p, up ? top + 10 * p : hy - 3 * p, 2 * p, p);
      break;
    }
    case "serve": {
      // a tray, carried level; now and then set down
      const down = t > 0 && every(t, 5, 0.2, ph);
      R(c, "#9ca3af", hx - 4 * p, down ? hy + 2 * p : hy - 4 * p, 8 * p, p);
      R(c, "#e5e5e5", hx - 2 * p, (down ? hy + 2 * p : hy - 4 * p) - 2 * p, 2 * p, 2 * p);
      break;
    }
    case "inspect": case "guard":
      R(c, "#d6d3c4", hx - p, hy - 5 * p, 3 * p, 4 * p);   // the clipboard
      if (t > 0 && every(t, 1.5, 0.3, ph)) R(c, "#1a1a1a", hx, hy - 4 * p, p, p);
      break;
    case "pour": {
      const tip = t > 0 && every(t, 4, 0.35, ph);
      if (tip) { R(c, "#4ade80", hx + side * 2 * p, hy - 6 * p, 4 * p, 2 * p); R(c, "#bbf7d0", hx + side * 5 * p, hy - 4 * p, p, 4 * p); }
      else R(c, "#4ade80", hx - p, hy - 7 * p, 2 * p, 5 * p);
      break;
    }
    case "type": case "trade": case "count":
      if (t > 0) R(c, "#c8f5d8", x + (flip ? 8 : -9) * p + (every(t, 0.2, 0.5, ph) ? p : 0), top + 22 * p, p, p);
      break;
    case "read": case "write":
      R(c, act === "read" ? "#b45309" : "#e5e5e5", x - 3 * p, top + 20 * p, 6 * p, 3 * p);
      if (act === "write" && t > 0 && every(t, 0.5, 0.5, ph)) R(c, "#1a1a1a", x + p, top + 19 * p, p, 2 * p);
      break;
    case "paint": {
      const dab = t > 0 && every(t, 1.4, 0.3, ph);
      R(c, "#8a6a42", hx + (dab ? side * 3 * p : 0), hy - 8 * p, p, 6 * p);
      R(c, ["#f87171", "#60a5fa", "#fbbf24"][Math.floor(ph * 3)], hx + (dab ? side * 3 * p : 0), hy - 9 * p, p, p);
      break;
    }
    case "lift": {
      const up = t > 0 && every(t, 2, 0.5, ph);
      const by = up ? top + 2 * p : top + 16 * p;
      R(c, "#9ca3af", x - 11 * p, by, 22 * p, p); R(c, "#111", x - 12 * p, by - 2 * p, 2 * p, 5 * p); R(c, "#111", x + 10 * p, by - 2 * p, 2 * p, 5 * p);
      break;
    }
    case "stir": case "valve": case "wind": case "crane": {
      const k = t > 0 ? Math.round(Math.sin((t * 1.2 + ph) * Math.PI * 2)) * p : 0;
      R(c, "#9ca3af", hx + side * 3 * p, hy - 10 * p + k, p, 10 * p);
      break;
    }
    case "hammer": {
      const up = t > 0 && every(t, 1, 0.35, ph);
      R(c, "#4a3018", hx + side * 4 * p, up ? hy - 16 * p : hy - 8 * p, p, 7 * p);
      R(c, "#374151", hx + side * 3 * p, up ? hy - 17 * p : hy - 9 * p, 4 * p, 2 * p);
      break;
    }
    case "sweep": case "rake": case "dig":
      R(c, "#8a6a42", hx + side * 2 * p, top + 18 * p, p, 24 * p);
      R(c, act === "dig" ? "#6b7280" : "#a16207", hx + side * 2 * p - p, top + 42 * p, 4 * p, 2 * p);
      break;
    case "deal": case "sell":
      if (t > 0 && every(t, 2.2, 0.4, ph)) R(c, act === "deal" ? "#e5e5e5" : "#f97316", hx + side * 4 * p, hy - 2 * p, 3 * p, 2 * p);
      break;
    case "sing": case "perform": case "piano":
      if (t > 0) { const n = frac(t / 2 + ph); R(c, "#c8f5d8", x + (flip ? 6 : -8) * p + n * 3 * p * side, top - n * 10 * p, 2 * p, 2 * p); R(c, "#c8f5d8", x + (flip ? 7 : -7) * p + n * 3 * p * side, top - n * 10 * p - 3 * p, p, 3 * p); }
      break;
    case "tend": case "patch":
      R(c, act === "tend" ? "#e5e5e5" : "#22d3ee", hx - p, hy - 4 * p, 3 * p, 4 * p);
      break;
    case "shelve":
      if (t > 0 && every(t, 3, 0.3, ph)) R(c, "#1e3a5f", hx - p, top + 6 * p, 2 * p, 5 * p);
      break;
    case "pipette": case "scope":
      if (t > 0 && every(t, 1.6, 0.4, ph)) R(c, "#22d3ee", hx + side * 5 * p, hy - 5 * p, p, 3 * p);
      break;
    case "cook":
      R(c, "#374151", hx + side * 4 * p, hy - 4 * p + (t > 0 && every(t, 1.2, 0.3, ph) ? -p : 0), 5 * p, p);
      break;
    default:
  }
}
