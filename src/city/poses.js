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
import { rigPose } from "./rigReact.js";   // the shared animation rig (rig.js): an act or reaction that is an animation

// A person's stature in a room cutaway: to scale, but never through the ceiling. footY is the
// anchor's feet measured from the room's top edge, hh the anchor's standing sprite height.
export function fitStature(s, footY, hh) {
  const k = statureOf(s);
  return k <= 1 || !(hh > 0) ? k : Math.min(k, Math.max(1, (footY - 2) / hh));
}

const HIP = 27;    // sprite rows kept above the seat
const SHIN = 38;   // sprite rows from here down are the lower legs
const SEAT = FH - SHIN;   // a seat is this many sprite rows off the floor

// catch and umpire: the crouch behind the plate is the sitting cut with no seat under it
// snap and stance: the center over the ball and a lineman's three-point stance, the same cut
const SIT = new Set(["drink", "eat", "talk", "read", "write", "listen", "pray", "watch", "gamble", "type", "trade", "count", "piano", "judge", "rest", "sit", "catch", "umpire", "feed", "snap", "stance"]);
// The pitch and the swing share one clock (and the jump shot its own), so a battery and its
// batter stay in time: callers pass the same phase to all three. Seconds per cycle.
export const PITCH_S = 4.2, SHOT_S = 5;
// The gridiron runs one play at a time on its own clock: set (0-0.56), the snap, the drop
// and the throw (0.72), the catch (0.86), the whistle. Every player on it shares the phase.
export const PLAY_S = 6, SNAP_F = 0.56, THROW_F = 0.72, CATCH_F = 0.86;
const KICK_S = 5, KEEP_S = 6.5;
const PLAY_ACTS = new Set(["snap", "stance", "throw", "receive", "wrap", "carry"]);
// a worker at somebody else's seat stands at it (sitting acts on a seat anchor only)
const WALK = new Set(["shelve", "tend", "sprint", "stroll", "patrol", "patch", "sweep"]);
export const poseOf = (a, act) => (act === "sleep" ? "lie" : a.walk && WALK.has(act) ? "walk" : SIT.has(act) && (act === a.act || a.kind === "seat" || a.kind === "bed") ? "sit" : "stand");

const SKIN = "#c8a27a";
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
const PITCH_ACTS = new Set(["pitch", "bat", "catch", "umpire", "ready"]);
export function drawPose(c, sheet, a, act, x, y, hh0, t, ph, k = 1) {
  const img = sheet.img, frames = sheet.frames || 1;
  if (PITCH_ACTS.has(act) || PLAY_ACTS.has(act)) ph = 0;   // one pitch (one play) at a time: everyone on it moves together
  // at the snap the linemen come up out of their stance and block, until the whistle
  if ((act === "stance" || act === "snap") && t > 0) { const g = frac(t / PLAY_S); if (g > SNAP_F + 0.02 && g < 0.93) act = "block"; }
  const bp = hh0 / FH, hh = hh0 * k;          // bp: one sprite pixel at the furniture's scale
  const f = hh / FH, ww = FW * f, px = f;   // one sprite pixel of this person
  let pose = poseOf(a, act);
  if (pose !== "lie" && !(pose === "walk" && !a.anim)) { const rb = rigPose(c, sheet, a, act, x, y, hh0, t, ph, k, pose === "sit", SEAT); if (rb) return rb; }
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
        else if (act === "catch" || act === "umpire") bob = frac(t / PITCH_S + ph) > 0.86 && frac(t / PITCH_S + ph) < 0.95 ? -px : 0;
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
    // the keeper's dive: the whole sprite laid out sideways, gloves first, then back up
    if (act === "keeper" && t > 0) {
      const g = frac(t / KEEP_S + ph);
      if (g > 0.8 && g < 0.93) {
        const side = flip ? 1 : -1, dir = frac(ph * 7.3) < 0.5 ? side : -side;
        c.save(); c.translate(Math.round(x + dir * hh * 0.35), Math.round(y - hh * 0.32)); c.rotate(dir * 1.2);
        c.drawImage(img, 0, 0, FW, FH, Math.round(-ww / 2), Math.round(-hh / 2), Math.round(ww), Math.round(hh));
        c.restore();
        R(c, "#a3e635", x + dir * hh * 0.78 - 2 * px, y - hh * 0.62, 4 * px, 3 * px);
        return [x + Math.min(0, dir) * hh, y - hh * 0.8, x + Math.max(0, dir) * hh, y];
      }
    }
    // standing
    if (t > 0 && pose !== "walk") {
      switch (act) {
        case "cheer": dy = every(t, 1.3, 0.25, ph) ? -3 * px : 0; break;
        case "pitch": {   // set, leg lift and rock back, stride and release, follow through
          const f = frac(t / PITCH_S + ph), side = flip ? 1 : -1;
          if (f > 0.55 && f < 0.72) { dy = -2 * px; dx -= side * px; } else if (f >= 0.72 && f < 0.84) { dx += side * 2 * px; dy = px; }
          break;
        }
        case "bat": { const f = frac(t / PITCH_S + ph); if (f > 0.8 && f < 0.9) dx += (flip ? 1 : -1) * px; break; }
        case "ready": { const f = frac(t / PITCH_S + ph); dy = px; if (f > 0.8 && f < 0.95) dx += Math.round(Math.sin((ph + f) * 40)) * px; break; }
        case "shoot": case "jump": { const f = frac(t / SHOT_S + ph); if (f > 0.7 && f < 0.86) dy = -Math.round(Math.sin((f - 0.7) / 0.16 * Math.PI) * 4) * px; break; }
        case "dribble": case "hustle": dx += Math.round(Math.sin((t * 0.9 + ph) * Math.PI * 2)) * px; break;
        case "defend": dx += Math.round(Math.sin((t * 1.3 + ph) * Math.PI * 2) * 1.4) * px; break;
        case "whistle": if (every(t, 6, 0.3, ph)) flip = !flip; break;
        // the gridiron (one clock) and the pitch (each their own)
        case "block": dx += (flip ? 1 : -1) * px; break;
        case "wrap": { const g = frac(t / PLAY_S); dy = px; if (g > SNAP_F + 0.02 && g < 0.9) dx += (flip ? 1 : -1) * 2 * px; break; }
        case "throw": { const g = frac(t / PLAY_S); if (g > SNAP_F && g < THROW_F) dx -= (flip ? 1 : -1) * 2 * px; else if (g >= THROW_F && g < THROW_F + 0.06) dx += (flip ? 1 : -1) * px; break; }
        case "receive": {
          const g = frac(t / PLAY_S), side = flip ? 1 : -1;
          if (g > SNAP_F && g < CATCH_F) { fi = frames > 1 ? Math.floor(t * 8) % 2 : 0; dy = fi ? -px : 0; dx += side * Math.round(((g - SNAP_F) / (CATCH_F - SNAP_F)) * 4) * px; }
          else if (g >= CATCH_F && g < 0.96) { dx += side * 4 * px; dy = -2 * px; }
          break;
        }
        case "carry": { const g = frac(t / PLAY_S); dy = g < SNAP_F ? px : 0; if (g > SNAP_F && g < 0.9) dx += (flip ? 1 : -1) * px; break; }
        case "kick": { const g = frac(t / KICK_S + ph), side = flip ? 1 : -1; if (g > 0.55 && g < 0.66) dx += side * 2 * px; else if (g >= 0.66 && g < 0.74) { dx += side * 3 * px; dy = -px; } break; }
        case "footwork": dx += Math.round(Math.sin((t * 1.4 + ph) * Math.PI * 2) * 1.5) * px; fi = frames > 1 ? Math.floor(t * 5 + ph * 8) % 2 : 0; break;
        case "kickball": { const g = frac(t / 3 + ph); if (g > 0.66 && g < 0.76) dx += (flip ? 1 : -1) * 2 * px; break; }
        case "header": { const g = frac(t / 4 + ph); if (g > 0.6 && g < 0.82) dy = -Math.round(Math.sin(((g - 0.6) / 0.22) * Math.PI) * 5) * px; break; }
        case "keeper": dy = px; dx += Math.round(Math.sin((t * 0.7 + ph) * Math.PI * 2)) * px; break;
        case "mark": dy = px; dx += Math.round(Math.sin((t * 1.1 + ph) * Math.PI * 2) * 1.4) * px; break;
        case "chase": fi = frames > 1 ? Math.floor(t * 8 + ph * 8) % 2 : 0; dy = fi ? -px : 0; dx += Math.round(Math.sin((t * 0.45 + ph) * Math.PI * 2) * 2) * px; break;
        case "amble": fi = frames > 1 ? Math.floor(t * 4 + ph * 8) % 2 : 0; dy = fi ? -px : 0; break;
        case "lift": dy = every(t, 2, 0.5, ph) ? 2 * px : 0; break;
        case "run": fi = frames > 1 ? Math.floor(t * 8 + ph * 8) % 2 : 0; dy = fi ? -px : 0; break;
        case "punch": dx += every(t, 1.1, 0.2, ph) ? 2 * px * (flip ? 1 : -1) : 0; break;
        case "hammer": case "haul": case "sort": case "rake": case "dig": dy = every(t, 1, 0.35, ph) ? px : 0; break;
        case "pick": dy = every(t, 2.2, 0.45, ph) ? 3 * px : 0; break;   // stoop to the row, up with the basket
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
    case "pitch": {
      const f = t > 0 ? frac(t / PITCH_S + ph) : 0.2;
      if (f < 0.72) R(c, "#f5f5f5", x + (f > 0.55 ? -side * 6 : side * 2) * p, top + (f > 0.55 ? 10 : 22) * p, 2 * p, 2 * p);   // the ball, then cocked back
      R(c, "#7c4a1e", x + side * 3 * p, top + 21 * p, 4 * p, 4 * p);   // the glove
      break;
    }
    case "bat": {
      const f = t > 0 ? frac(t / PITCH_S + ph) : 0.3, col = "#c8a26a";
      if (f < 0.82) { R(c, col, x - side * 5 * p, top + 4 * p, 2 * p, 13 * p); R(c, "#2a1a0a", x - side * 5 * p, top + 16 * p, 2 * p, 2 * p); }   // cocked over the back shoulder
      else if (f < 0.9) R(c, col, x + (side > 0 ? 0 : -15) * p, top + 20 * p, 15 * p, 2 * p);                                         // through the zone
      else R(c, col, x + side * 3 * p, top + 6 * p, 2 * p, 12 * p);                                                                      // follow-through
      break;
    }
    case "ready":
      R(c, "#7c4a1e", hx - 2 * p, top + 26 * p, 5 * p, 4 * p);   // glove down, hands on knees
      break;
    case "catch": {
      const f = t > 0 ? frac(t / PITCH_S + ph) : 0.2;
      R(c, "#5a3418", x + side * 5 * p, top + 12 * p, 6 * p, 6 * p);   // the mitt, up as the target
      if (f > 0.86 && f < 0.97) R(c, "#f5f5f5", x + side * 7 * p, top + 14 * p, 2 * p, 2 * p);
      break;
    }
    case "umpire": {
      R(c, "#111827", x - 3 * p, top + 5 * p, 6 * p, 2 * p);   // the mask
      const f = t > 0 ? frac(t / PITCH_S + ph) : 0;
      if (f > 0.9 || f < 0.04) R(c, "#111827", x + side * 6 * p, top - 5 * p, 2 * p, 12 * p);   // STRIKE (logged)
      break;
    }
    case "shoot": {
      const f = t > 0 ? frac(t / SHOT_S + ph) : 0.65;
      if (f > 0.58 && f < 0.82) R(c, "#f97316", x - 2 * p, top - 4 * p, 4 * p, 4 * p);   // set, over the head
      else if (f >= 0.82) { const k = (f - 0.82) / 0.18; R(c, "#f97316", x + side * k * 30 * p - 2 * p, top - 4 * p - Math.sin(k * Math.PI) * 16 * p, 4 * p, 4 * p); }
      break;
    }
    case "dribble": {
      const b = t > 0 ? Math.abs(Math.sin((t * 1.7 + ph) * Math.PI)) : 0.5;   // hand to floor and back
      R(c, "#f97316", hx + side * 2 * p - 2 * p, top + 26 * p + (1 - b) * 18 * p, 4 * p, 4 * p);
      break;
    }
    case "defend":
      R(c, "#c8a27a", x - 10 * p, top + 12 * p, 2 * p, 3 * p); R(c, "#c8a27a", x + 8 * p, top + 12 * p, 2 * p, 3 * p);   // hands up, wide
      break;
    case "whistle":
      if (t > 0 && every(t, 3, 0.25, ph)) { R(c, "#e5e5e5", x + side * 3 * p, top + 11 * p, 2 * p, p); R(c, "#111827", x + side * 7 * p, top - 3 * p, 2 * p, 10 * p); }
      break;
    case "feed":
      for (let k = 0; k < 3; k++) {   // pigeons, pecking at what they are given
        const hop = t > 0 && every(t, 0.7 + k * 0.23, 0.3, ph + k * 0.31) ? -p : 0;
        R(c, "#9ca3af", x + side * (9 + k * 4) * p, top + 35 * p + hop, 3 * p, 2 * p); R(c, "#6b7280", x + side * (11 + k * 4) * p, top + 34 * p + hop, p, p);
      }
      if (t > 0 && every(t, 2.5, 0.2, ph)) R(c, "#d6c9a0", hx + side * 3 * p, top + 30 * p, p, p);
      break;
    // THE ASSEMBLY's lot (civicDraw.js): the course and the farm
    case "golf": {   // address the ball, swing (up over the shoulder, through), watch it go
      const f = t > 0 ? frac(t / 6 + ph) : 0.2, col = "#d1d5db";
      if (f < 0.6) { R(c, col, x - side * 2 * p, top + 24 * p, p, 20 * p); R(c, "#374151", x - side * 2 * p - p, top + 43 * p, 3 * p, 2 * p); }
      else if (f < 0.72) R(c, col, x - side * 8 * p, top + 2 * p, p, 18 * p);
      else if (f < 0.78) R(c, col, x - (side > 0 ? 14 : 0) * p, top + 30 * p, 14 * p, p);
      else R(c, col, x + side * 6 * p, top + 4 * p, p, 16 * p);
      if (f < 0.72) R(c, "#f5f5f5", x + side * 2 * p, top + 45 * p, 2 * p, 2 * p);
      break;
    }
    case "putt": {
      const f = t > 0 ? frac(t / 5 + ph) : 0.2;
      R(c, "#d1d5db", x + side * 2 * p, top + 24 * p, p, 20 * p);
      R(c, "#f5f5f5", x + side * (5 + (f > 0.5 ? (f - 0.5) * 30 : 0)) * p, top + 45 * p, 2 * p, 2 * p);
      break;
    }
    case "caddie": {   // the bag on the shoulder, the clubs out of the top
      R(c, "#7c2d12", x + side * 6 * p, top + 14 * p, 4 * p, 22 * p);
      R(c, "#d1d5db", x + side * 6 * p, top + 10 * p, p, 5 * p); R(c, "#d1d5db", x + side * 8 * p, top + 9 * p, p, 6 * p);
      break;
    }
    case "pick": {   // a basket at the hip, filling
      R(c, "#a16207", hx - 3 * p, hy + 2 * p, 7 * p, 5 * p);
      R(c, ["#dc2626", "#84cc16", "#f97316"][Math.floor(ph * 3)], hx - 2 * p, hy + p, 5 * p, 2 * p);
      break;
    }
    case "tend": case "patch":
      R(c, act === "tend" ? "#e5e5e5" : "#22d3ee", hx - p, hy - 4 * p, 3 * p, 4 * p);
      break;
    // the gridiron: the ball is brown with a white lace, the officials in black and white
    case "snap":
      if (t <= 0 || frac(t / PLAY_S) < SNAP_F) { R(c, "#7c3f1a", x + side * 5 * p, top + 48 * p, 5 * p, 3 * p); R(c, "#f5f5f5", x + side * 5 * p + 2 * p, top + 48 * p, p, 3 * p); }
      R(c, SKIN, x + side * 6 * p, top + 30 * p, 2 * p, 18 * p);   // the hand on the ball
      break;
    case "stance":
      R(c, SKIN, x + side * 7 * p, top + 26 * p, 2 * p, 24 * p); R(c, SKIN, x + side * 6 * p, top + 48 * p, 3 * p, 2 * p);   // one hand down
      break;
    case "block":
      R(c, SKIN, x + side * 9 * p, top + 17 * p, 3 * p, 3 * p); R(c, SKIN, x + side * 9 * p, top + 23 * p, 3 * p, 3 * p);
      break;
    case "wrap":
      R(c, SKIN, x + side * 9 * p, top + 15 * p, 4 * p, 2 * p); R(c, SKIN, x + side * 9 * p, top + 22 * p, 4 * p, 2 * p);   // arms out, ready to wrap (and let go)
      break;
    case "throw": {
      const g = t > 0 ? frac(t / PLAY_S) : 0.65;
      if (g > SNAP_F && g < THROW_F) R(c, "#7c3f1a", x - side * 5 * p, top + 9 * p, 5 * p, 3 * p);             // cocked by the ear
      else if (g >= THROW_F && g < THROW_F + 0.05) R(c, "#7c3f1a", x + side * 7 * p, top + p, 5 * p, 3 * p);   // released
      break;
    }
    case "receive": {
      const g = t > 0 ? frac(t / PLAY_S) : 0;
      if (g >= CATCH_F && g < 0.96) { R(c, SKIN, x - 4 * p, top - 3 * p, 2 * p, 5 * p); R(c, SKIN, x + 3 * p, top - 3 * p, 2 * p, 5 * p); R(c, "#7c3f1a", x - 3 * p, top - 5 * p, 6 * p, 3 * p); }
      break;
    }
    case "kick": {
      const g = t > 0 ? frac(t / KICK_S + ph) : 0.3, foot = top + (FH - 4) * p;
      if (g < 0.68) { R(c, "#f97316", x + side * 8 * p, foot + 2 * p, 3 * p, 2 * p); R(c, "#7c3f1a", x + side * 8 * p, foot - 3 * p, 3 * p, 5 * p); }   // on the tee
      else if (g < 0.95) { const k = (g - 0.68) / 0.27; R(c, "#7c3f1a", x + side * (8 + k * 34) * p, foot - 3 * p - Math.sin(k * Math.PI * 0.8) * 40 * p, 4 * p, 3 * p); }
      break;
    }
    case "signal":
      if (t > 0 && every(t, 8, 0.18, ph)) { R(c, "#111827", x - 7 * p, top - 7 * p, 2 * p, 13 * p); R(c, "#111827", x + 5 * p, top - 7 * p, 2 * p, 13 * p); }   // arms up: it counts
      else R(c, "#facc15", hx, top + 30 * p, 3 * p, 2 * p);   // the flag, in the pocket
      break;
    case "chain":
      R(c, "#e5e7eb", x + side * 7 * p, top - 8 * p, p, (FH + 8) * p); R(c, "#f97316", x + side * 6 * p, top - 12 * p, 4 * p, 4 * p);
      break;
    // the pitch: a white ball with a black patch
    case "footwork": {
      const bx = x + side * 4 * p + (t > 0 ? Math.round(Math.sin((t * 2.8 + ph) * Math.PI) * 3) : 0) * p, by = top + (FH - 4) * p;
      R(c, "#f5f5f5", bx, by, 4 * p, 4 * p); R(c, "#111", bx + p, by + p, p, p);
      break;
    }
    case "kickball": {
      const g = t > 0 ? frac(t / 3 + ph) : 0.3, k = g < 0.72 ? 0 : (g - 0.72) / 0.28, by = top + (FH - 4) * p;
      R(c, "#f5f5f5", x + side * (5 + k * 26) * p, by - Math.sin(k * Math.PI) * 6 * p, 4 * p, 4 * p);
      break;
    }
    case "header": {
      const g = t > 0 ? frac(t / 4 + ph) : 0;
      if (g > 0.55 && g < 0.9) { const k = (g - 0.55) / 0.35; R(c, "#f5f5f5", x - 2 * p + (k > 0.5 ? side * (k - 0.5) * 20 * p : 0), top - 5 * p - (k < 0.5 ? (0.5 - k) * 24 * p : 0), 4 * p, 4 * p); }
      break;
    }
    case "keeper":
      R(c, "#a3e635", x - 9 * p, top + 19 * p, 3 * p, 3 * p); R(c, "#a3e635", x + 7 * p, top + 19 * p, 3 * p, 3 * p);   // gloves
      break;
    case "flag":
      if (t > 0 && every(t, 7, 0.3, ph)) { R(c, "#111827", x + side * 6 * p, top - 3 * p, p, 14 * p); R(c, "#facc15", x + side * 7 * p, top - 3 * p, 5 * p, 4 * p); }   // OFFSIDE (logged)
      else { R(c, "#111827", x + side * 6 * p, top + 24 * p, p, 12 * p); R(c, "#facc15", x + side * 7 * p, top + 32 * p, 4 * p, 3 * p); }
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
