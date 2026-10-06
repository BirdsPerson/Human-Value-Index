// THE DEPARTMENT LINKS, the mouse and the finger: a drag on the picture read as a swing. Pure (no
// DOM, no clock of its own): a gesture is the pointer's samples [{x, y, t}] in the canvas's own
// pixels (320x224) and milliseconds. Golf.jsx collects them; the stroke it reads is logged into the
// round as ONE event of computed numbers (sim.js act), so a replay never needs the samples.
//
// A FULL SWING ("drag swing"): press, PULL BACK (drag down) to take the club back (the distance
// pulled is the power, capped at PULL_FULL), then PUSH FORWARD (drag up) back past where the press
// began: the club comes through and the ball is struck at that moment.
//   line    how far the forward stroke drifts off vertical (sideways per pixel up). Right of
//           vertical is a slice for a right-hander, left a hook; a small wobble is a small curve
//           (a dead zone, then a straight ramp)
//   tempo   the forward stroke's time from the bottom to the strike: inside the sweet band is pure
//           contact; slower is FAT (short), quicker is THIN (low, runs)
//   cancel  let go before pushing through and nothing happens: no stroke
// A PUTT: drag back for pace (the meter's marker, the same scale as the two-tap meter), let go to
// putt; drifting sideways while drawing it back pushes or pulls the line a touch.
// A CLICK (no drag) is the classic meter's button: the caller presses A.
// EASY SWING widens the dead zone and the sweet band; the sim also keeps two fifths of a miss.

export const PULL_FULL = 64;      // canvas px pulled for full power
export const PULL_PUTT = 72;      // canvas px pulled for the putter's full pace
export const PULL_MIN = 6;        // less than this and it is not a swing
export const CLICK_MOVE = 4;      // a press that moves less than this and lets go is a click
const SWEET = { lo: 70, hi: 280 }, SWEET_EASY = { lo: 45, hi: 420 };   // ms, bottom to strike
const DEAD = 0.05, DEAD_EASY = 0.1, RAMP = 0.45;                        // drift per px up -> curve
export const PUTT_DRIFT = 0.025;  // radians the putter's line moves at the most

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The swing so far, for the picture: -> {pull, m (0..1: the meter's marker), stage (1 back, 2
// through), through (struck), drift (px sideways on the way through)}
export function liveSwing(S, putt = false) {
  if (!S.length) return { pull: 0, m: 0, stage: 1, through: false, drift: 0 };
  const y0 = S[0].y;
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y >= S[ib].y) ib = i;
  const pull = Math.max(0, S[ib].y - y0), full = putt ? PULL_PUTT : PULL_FULL, power = Math.min(1, pull / full);
  const last = S[S.length - 1], back = last.y >= S[ib].y - 1 || ib === S.length - 1;
  const through = !putt && pull >= PULL_MIN && S.slice(ib).some(p => p.y <= y0);
  if (putt || back) return { pull, m: power, power, stage: 1, through, drift: last.x - S[0].x };
  // on the way through the marker falls back with the club
  return { pull, m: clamp((last.y - y0) / full, 0, 1), power, stage: 2, through, drift: last.x - S[ib].x };
}

// The finished gesture: -> {kind: "click"} | {kind: "cancel"} | {kind: "swing", power, a, contact}
// | {kind: "putt", m, off}. `done`: the pointer was let go (a putt strikes on letting go; a swing
// strikes the moment it pushes through, without waiting).
export function readSwing(S, { putt = false, easy = false, done = true } = {}) {
  if (!S.length) return { kind: "cancel" };
  const x0 = S[0].x, y0 = S[0].y;
  const moved = Math.max(...S.map(p => Math.hypot(p.x - x0, p.y - y0)));
  if (done && moved < CLICK_MOVE) return { kind: "click" };
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y >= S[ib].y) ib = i;
  const pull = S[ib].y - y0;
  if (pull < PULL_MIN) return done ? { kind: "cancel" } : { kind: "pending" };
  if (putt) {
    if (!done) return { kind: "pending" };
    const last = S[S.length - 1], drift = (last.x - x0) / Math.max(pull, 12), dz = easy ? 0.16 : 0.08;
    const off = Math.sign(drift) * clamp((Math.abs(drift) - dz) / 0.6, 0, 1) * PUTT_DRIFT;
    return { kind: "putt", m: Math.min(1, pull / PULL_PUTT), off };
  }
  // the strike: the first sample back past the start, the crossing interpolated
  let it = -1;
  for (let i = ib + 1; i < S.length; i++) if (S[i].y <= y0) { it = i; break; }
  if (it < 0) return done ? { kind: "cancel" } : { kind: "pending" };
  const p = S[it - 1], q = S[it], f = p.y === q.y ? 1 : (p.y - y0) / (p.y - q.y);
  const xs = p.x + (q.x - p.x) * f, ts = p.t + (q.t - p.t) * f;
  const b = S[ib], rise = b.y - y0;
  const slope = (xs - b.x) / Math.max(1, rise), dz = easy ? DEAD_EASY : DEAD;
  const a = Math.sign(slope) * clamp((Math.abs(slope) - dz) / RAMP, 0, 1.2);
  const T = ts - b.t, band = easy ? SWEET_EASY : SWEET;
  const contact = T < band.lo ? clamp((band.lo - T) / band.lo, 0, 1) : T > band.hi ? -clamp((T - band.hi) / (band.hi * 1.5), 0, 1) : 0;
  return { kind: "swing", power: Math.min(1, pull / PULL_FULL), a, contact, slope, ms: T };
}

// The words for a stroke (the screen reader, the HUD). `a` is the ball's: positive curves right.
// hand: +1 right-handed (a curve to the right is a slice), -1 left-handed (it is a hook).
export const contactWord = (c) => (c <= -0.15 ? "FAT" : c >= 0.15 ? "THIN" : "PURE");
export const lineWord = (a, hand = 1) => { const v = a * (hand < 0 ? -1 : 1); return v > 0.6 ? "SLICE" : v > 0.12 ? "FADE" : v < -0.6 ? "HOOK" : v < -0.12 ? "DRAW" : "STRAIGHT"; };

// THE RIGHT STICK (a pad; Scott: like the PGA Tour games' analog swing): the same swing, the stick
// as the hand. Samples [{x, y, t}] are the stick as stickRead gives it (x right, y DOWN, -1..1:
// dead zone taken out, the pad's own outer ring normalised, filtered) from the moment it is pulled.
// Pull DOWN to take it back (how far = power: a natural full pull (STICK_FULL) is full power, no
// need to slam the stick into the gate; a gentle curve under it), push UP past STICK_THROUGH to
// swing through (struck as it crosses); drifting left/right of vertical on the way up is the line
// (a dead zone, then a ramp, both wider on EASY SWING), the push's time the contact, measured from
// the moment the stick leaves the bottom (a thumb that rests at the top of the backswing is not
// slow). Let the stick sit back at the centre before pushing: called off. A putt: pull back for
// pace (a finer curve: short putts take more of the stick), push forward through STICK_PUTT.
//
// Tuned 2026-10-06 (Scott: the sensitivity "could be a little better"): dead zone 0.12 radial,
// rescaled; full power at 0.82 of the ring; the one-euro filter below instead of a fixed average.
export const STICK_FULL = 0.82, STICK_PUTT_FULL = 0.9, STICK_THROUGH = -0.4, STICK_PUTT = -0.25, STICK_IDLE = 140;
export const STICK_PULL = STICK_FULL;   // the old name (check-golf)
const STICK_SWEET = { lo: 35, hi: 230 }, STICK_SWEET_EASY = { lo: 20, hi: 360 };
const STICK_DEAD = 0.06, STICK_DEAD_EASY = 0.14, STICK_RAMP = 0.5, STICK_RAMP_EASY = 0.7;
const LEFT_BOTTOM = 0.1;   // the push has begun once the stick is this far up from its deepest pull
// how far back (0..1) -> power (0..1): slightly more than linear low down, flat past STICK_FULL
export const stickPower = (pull, putt = false) => {
  const u = clamp(pull / (putt ? STICK_PUTT_FULL : STICK_FULL), 0, 1);
  return putt ? Math.pow(u, 1.3) : 1 - Math.pow(1 - u, 1.15);
};
export function stickSwing(S, { putt = false, easy = false } = {}) {
  if (!S.length) return { kind: "pending" };
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y >= S[ib].y) ib = i;
  const b = S[ib], pull = b.y;
  if (pull < 0.08) return { kind: "pending" };
  const line = putt ? STICK_PUTT : STICK_THROUGH;
  let it = -1, idle = -1;
  for (let i = ib + 1; i < S.length; i++) {
    if (S[i].y <= line) { it = i; break; }
    if (Math.hypot(S[i].x, S[i].y) < 0.03) { if (idle < 0) idle = S[i].t; if (S[i].t - idle >= STICK_IDLE) return { kind: "cancel" }; } else idle = -1;
  }
  if (it < 0) return { kind: "pending" };
  const p = S[it - 1], q = S[it], f = p.y === q.y ? 1 : (p.y - line) / (p.y - q.y);
  const xs = p.x + (q.x - p.x) * f, ts = p.t + (q.t - p.t) * f;
  // the push began when the stick left the bottom: the first sample LEFT_BOTTOM up from the pull
  let t0 = b.t;
  for (let i = ib + 1; i <= it; i++) if (S[i].y <= pull - LEFT_BOTTOM) { const a0 = S[i - 1], a1 = S[i], g = a0.y === a1.y ? 1 : (a0.y - (pull - LEFT_BOTTOM)) / (a0.y - a1.y); t0 = a0.t + (a1.t - a0.t) * g; break; }
  const power = stickPower(pull, putt), slope = (xs - b.x) / Math.max(0.2, pull - line);
  if (putt) {
    const dz = easy ? 0.18 : 0.1, off = Math.sign(slope) * clamp((Math.abs(slope) - dz) / 0.6, 0, 1) * PUTT_DRIFT;
    return { kind: "putt", m: Math.max(0.005, power), off, slope };
  }
  const dz = easy ? STICK_DEAD_EASY : STICK_DEAD, ramp = easy ? STICK_RAMP_EASY : STICK_RAMP;
  const a = Math.sign(slope) * clamp((Math.abs(slope) - dz) / ramp, 0, 1.2);
  const T = Math.max(0, ts - t0), band = easy ? STICK_SWEET_EASY : STICK_SWEET;
  const contact = T < band.lo ? clamp((band.lo - T) / band.lo, 0, 1) : T > band.hi ? -clamp((T - band.hi) / (band.hi * 1.5), 0, 1) : 0;
  return { kind: "swing", power, a, contact, slope, ms: T };
}
// the stick's swing so far, for the picture (the meter, the golfer's backswing)
export function liveStick(S, putt = false) {
  if (!S.length) return null;
  let ib = 0;
  for (let i = 1; i < S.length; i++) if (S[i].y >= S[ib].y) ib = i;
  const last = S[S.length - 1], power = stickPower(S[ib].y, putt);
  if (power < 0.03) return null;
  const back = putt || last.y >= S[ib].y - 0.02;
  return { m: back ? power : clamp(stickPower(Math.max(0, last.y), putt), 0, 1), power, stage: back ? 1 : 2, pull: power };
}

// ---- reading the stick: the dead zone, the pad's own ring, a filter that does not lag ------------------
// Browsers hand over the raw axes (-1..1 each). Two pads disagree about where "all the way" is: a
// round gate stops short of 1.0 on the straights (0.9 on some), a square gate goes past it on the
// diagonals (1.4). stickReader learns the pad's ring from the furthest it has been pushed (starting
// at STICK_RING0) and reads every sample against it, so a full pull is the same on every pad. The
// dead zone is radial and rescaled (motion starts from zero at its edge). The smoothing is the
// one-euro filter (Casiez, Roussel, Vogel, CHI 2012): a low cutoff when the stick is still (no
// jitter), opening with speed (a push comes through with no lag to speak of).
export const STICK_DZ = 0.12, STICK_RING0 = 0.9;
const EURO_MIN = 1.5, EURO_BETA = 2.5, EURO_D = 1;   // Hz, Hz per (unit/s), Hz
export const stickReader = () => ({ ring: STICK_RING0, fx: 0, fy: 0, dx: 0, dy: 0, t: null });
// raw axes at time t (ms) -> {x, y, mag}: after the ring, the dead zone and the filter
export function stickRead(r, ax, ay, t) {
  ax = Number.isFinite(ax) ? ax : 0; ay = Number.isFinite(ay) ? ay : 0;
  const m = Math.hypot(ax, ay);
  if (m > r.ring) r.ring = Math.min(1, m);
  const u = m / r.ring;
  let x = 0, y = 0;
  if (u > STICK_DZ) { const k = Math.min(1, (u - STICK_DZ) / (1 - STICK_DZ)); x = (ax / m) * k; y = (ay / m) * k; }
  if (r.t == null || t <= r.t) { r.fx = x; r.fy = y; r.dx = r.dy = 0; r.t = t; return { x, y, mag: Math.hypot(x, y) }; }
  const dt = Math.min(0.1, Math.max(1e-3, (t - r.t) / 1000)); r.t = t;
  const alpha = (fc) => { const tau = 1 / (2 * Math.PI * fc); return 1 / (1 + tau / dt); };
  const ad = alpha(EURO_D);
  r.dx += ((x - r.fx) / dt - r.dx) * ad; r.dy += ((y - r.fy) / dt - r.dy) * ad;
  const a = alpha(EURO_MIN + EURO_BETA * Math.hypot(r.dx, r.dy));
  r.fx += (x - r.fx) * a; r.fy += (y - r.fy) * a;
  // the stick at rest in the dead zone reads exactly zero, so an idle stick is idle
  if (!x && !y && Math.hypot(r.fx, r.fy) < 0.02) { r.fx = 0; r.fy = 0; }
  return { x: r.fx, y: r.fy, mag: Math.hypot(r.fx, r.fy) };
}

// ---- the swing path, for the player to learn from (render.js draws it; never reaches the sim) ------
// A finished stroke and its samples -> {pts: [[x, y], ...] (-1..1 across, back is +y), words: [the
// line, the tempo], power, putt}. The samples are the mouse's canvas px (scale: PULL_FULL) or the
// stick's units (scale 1). The words are golf's: a right-hander's drift right starts the ball
// right (PUSHED) and left (PULLED); a push slower than the band is TOO SLOW (fat), quicker TOO FAST
// (thin). For a left-hander the names swap: a drift to the right starts the ball left of the
// line they stand on, a pull.
export const pathWord = (a, hand = 1) => { const v = a * (hand < 0 ? -1 : 1); return v > 0.12 ? "PUSHED" : v < -0.12 ? "PULLED" : "STRAIGHT"; };
export const tempoWord = (c) => (c <= -0.15 ? "TOO SLOW" : c >= 0.15 ? "TOO FAST" : "GOOD TEMPO");
export function swingTrace(r, S, scale = 1, hand = 1) {
  if (!S || S.length < 2) return null;
  const x0 = S[0].x, y0 = scale === 1 ? 0 : S[0].y, k = 1 / (scale === 1 ? 1 : PULL_FULL * 1.1);
  const pts = [];
  for (let i = 0; i < S.length; i++) {
    const x = clamp((S[i].x - x0) * k, -1, 1), y = clamp((S[i].y - y0) * k, -1, 1);
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last[0] - x) + Math.abs(last[1] - y) > 0.02) pts.push([x, y]);
  }
  if (r.kind === "putt") return { pts, words: [`PACE ${Math.round(r.m * 100)}%`, r.off ? pathWord(Math.sign(r.off), hand) : "STRAIGHT"], power: r.m, putt: true };
  if (r.kind !== "swing") return null;
  return { pts, words: [pathWord(r.a, hand), tempoWord(r.contact)], power: r.power, putt: false };
}
