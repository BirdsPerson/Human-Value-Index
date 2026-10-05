// THE AIRPORT's flights (PHASE 2 step 4): a deterministic schedule on the machine clock, so every
// viewer sees the same aircraft in the same place. Pure (no DOM), checked by scripts/check-east.mjs.
//
// One runway, 09/27, east-west along the airfield's north side. Every flight comes in from the east
// and leaves to the east (a one-way airport: the approach and the climb-out are over open ground east
// of the field, never over the Suburbs' homes or the core). An arrival every half hour from 05:00 to
// 22:30 (touchdown on the hour and the half hour); each turns round at a stand on the apron in front
// of the departures hall and leaves forty machine minutes after it landed. No movements from 23:30
// to 05:00 (the curfew: NIGHT FLIGHTS ARE NOT PERMITTED. NEITHER IS SLEEP.).
//
// Map cells; altitude in storeys. Heading: the unit vector the nose points along.

export const RUNWAY = { y: 60.5, x0: 216, x1: 283, w: 3.2 };   // the strip's centreline and its thresholds
export const TAXI_Y = 65.0;                                     // the parallel taxiway
export const STAND_Y = 70.4, STANDS = [218.5, 225.5, 232.5, 239.5];   // the apron's stands, nose to the hall
export const FIRST = 5, LAST = 22.5, EVERY = 0.5, TURN = 40 / 60;   // hours
export const CRUISE_ALT = 9, APPROACH_X = 345, TOUCH_X = 280, EXIT_X = 236, ROTATE_X = 258;
const M = 1 / 60;
// the phases of one flight, in hours from its touchdown
const P = { approach: -4 * M, touch: 0, rolled: 1.6 * M, atStand: 5 * M, push: TURN - 5 * M, lined: TURN, airborne: TURN + 0.9 * M, gone: TURN + 4.5 * M };

export const AIRLINES = [
  { code: "DA", name: "DEPARTMENT AIR", body: "#e5e7eb", tail: "#16a34a", stripe: "#14532d" },
  { code: "OX", name: "OVERLORD EXPRESS", body: "#f5f5f4", tail: "#b91c1c", stripe: "#7f1d1d" },
  { code: "T1", name: "TIER ONE", body: "#e0e7ff", tail: "#1d4ed8", stripe: "#facc15" },
  { code: "MF", name: "MANIFEST", body: "#fafaf9", tail: "#f59e0b", stripe: "#0f172a" },
];
// Where they come from and go to (the Department lists no other cities by name: they are numbered).
const PORTS = ["SECTOR 2", "SECTOR 4", "SECTOR 7", "SECTOR 9", "SECTOR 11", "THE OUTER RING", "SECTOR 12", "SECTOR 16"];

// Flight n of a machine day: n = 0.. (one every EVERY hours from FIRST).
export const FLIGHTS_A_DAY = Math.floor((LAST - FIRST) / EVERY) + 1;
export function flight(day, n) {
  const k = (day * 37 + n * 11) >>> 0, line = AIRLINES[k % AIRLINES.length];
  const touch = (day - 1) * 24 + FIRST + n * EVERY;
  return {
    id: `${line.code} ${100 + ((day * 7 + n * 13) % 900)}`, day, n, line, touch, takeoff: touch + TURN,
    stand: n % STANDS.length, from: PORTS[(k >> 3) % PORTS.length], to: PORTS[(k >> 5) % PORTS.length],
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
// along a polyline of [x, y] at fraction t (by length) -> {x, y, hx, hy}
function along(pts, t) {
  const seg = [];
  let L = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
  let want = clamp01(t) * L;
  for (let i = 1; i < pts.length; i++) {
    const d = seg[i - 1];
    if (want <= d || i === pts.length - 1) { const f = d > 0 ? Math.min(1, want / d) : 1, a = pts[i - 1], b = pts[i]; return { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), hx: (b[0] - a[0]) / (d || 1), hy: (b[1] - a[1]) / (d || 1) }; }
    want -= d;
  }
  const a = pts[pts.length - 1];
  return { x: a[0], y: a[1], hx: -1, hy: 0 };
}

// One flight at machine hour T -> {x, y, alt, hx, hy, phase, ...flight} or null (not at the field).
export function flightAt(f, T) {
  const t = T - f.touch, sx = STANDS[f.stand], Y = RUNWAY.y;
  if (t < P.approach || t >= P.gone) return null;
  let s;
  if (t < P.touch) {   // finals: down the glide path from the east, westbound
    const u = (t - P.approach) / (P.touch - P.approach);
    s = { x: lerp(APPROACH_X, TOUCH_X, u), y: Y, alt: lerp(CRUISE_ALT * 0.7, 0, u), hx: -1, hy: 0, phase: "landing" };
  } else if (t < P.rolled) {   // the landing roll, slowing
    const u = (t - P.touch) / (P.rolled - P.touch), e = 1 - (1 - u) * (1 - u);
    s = { x: lerp(TOUCH_X, EXIT_X, e), y: Y, alt: 0, hx: -1, hy: 0, phase: "rollout" };
  } else if (t < P.atStand) {   // off the runway, along the taxiway, into the stand
    const u = (t - P.rolled) / (P.atStand - P.rolled), a = along([[EXIT_X, Y], [EXIT_X, TAXI_Y], [sx, TAXI_Y], [sx, STAND_Y]], u);
    s = { ...a, alt: 0, phase: "taxi-in" };
  } else if (t < P.push) {   // at the stand, nose to the hall
    s = { x: sx, y: STAND_Y, alt: 0, hx: 0, hy: 1, phase: "at-stand" };
  } else if (t < P.lined) {   // pushed back, along the taxiway to the west end, onto the runway
    const u = (t - P.push) / (P.lined - P.push), a = along([[sx, STAND_Y], [sx, TAXI_Y], [RUNWAY.x0 + 1.5, TAXI_Y], [RUNWAY.x0 + 1.5, Y], [RUNWAY.x0 + 2.5, Y]], u);
    s = { ...a, phase: "taxi-out", alt: 0 };
    if (u < 0.18) { s.hx = 0; s.hy = 1; }   // the push back: nose still to the hall
  } else if (t < P.airborne) {   // the take-off roll, east
    const u = (t - P.lined) / (P.airborne - P.lined);
    s = { x: lerp(RUNWAY.x0 + 2.5, ROTATE_X, u * u), y: Y, alt: 0, hx: 1, hy: 0, phase: "takeoff" };
  } else {   // the climb-out, east
    const u = (t - P.airborne) / (P.gone - P.airborne);
    s = { x: lerp(ROTATE_X, APPROACH_X + 10, u), y: Y, alt: CRUISE_ALT * ease(u * 1.2), hx: 1, hy: 0, phase: "climb" };
  }
  return { ...f, ...s };
}

// Every aircraft at the field or on its approach and climb-out at machine hour T.
export function planesAt(T) {
  const day = Math.floor(T / 24) + 1, out = [];
  for (const d of [day - 1, day]) for (let n = 0; n < FLIGHTS_A_DAY; n++) { const p = flightAt(flight(d, n), T); if (p) out.push(p); }
  return out;
}

// The departures board: the next n movements from machine hour T.
export function flightBoard(T, n = 4) {
  const day = Math.floor(T / 24) + 1, rows = [];
  for (const d of [day, day + 1]) for (let k = 0; k < FLIGHTS_A_DAY; k++) {
    const f = flight(d, k);
    if (f.touch >= T) rows.push({ t: f.touch, kind: "ARR", id: f.id, port: f.from, line: f.line.name });
    if (f.takeoff >= T) rows.push({ t: f.takeoff, kind: "DEP", id: f.id, port: f.to, line: f.line.name });
  }
  return rows.sort((a, b) => a.t - b.t).slice(0, n);
}
export const CURFEW = "NIGHT FLIGHTS ARE NOT PERMITTED. NEITHER IS SLEEP.";
