// THE ATTRITION: the river from the mountain to the sea (Scott, 2026-10-05: "an endless river from
// the mountain to the sea"). Pure data and geometry, no imports (sim.js reads the walking blocks, so
// this module may not import anything that imports sim.js). Map cells; y is negative to the north.
//
// THE COURSE. The main stem comes in from beyond the edge of the drawn world (it runs north into the
// unbuilt Substrate for ever: the first point is thousands of cells out), down the seam between THE
// FARMLAND and the mountain's west foot. THE BURNOUT, the snowmelt, rises high on the mountain under
// THE GLASS CEILING, falls down the west face, rests in THE RETENTION POOL (the mountain lake) and runs
// on down to join the main stem at THE MERGER. The river then crosses the village's west end and THE
// FOOTHILLS (the forest belt) on the diagonal, and runs through the city in the gaps the districts
// already leave: the gutter between THE ARTS QUARTER and CAMPUS, under the Loop, round the Arena's
// grounds, down the street between the Arena and DEPT HQ, under the Loop again, the gutter between THE
// COMMONS and THE WORKS, along the street behind the Pit, under the Shore Line, through the gap
// between SEAVIEW FLATS and THE SHORE PLAZA (once THE SURFSIDE), under the boardwalk, and out across the sand to the sea
// beside THE PIER (THE OUTPLACEMENT: the estuary, its sandbars). No building moved; no id changed.
//
// THE DAY BOUNDARY. A layout change takes effect at a machine-day boundary (docs/planning/
// MASTER_PLAN.md): RIVER_DAY is the first day built on the river's ground (layout 7). Before it, every
// walk is laid out as it always was and the river is not drawn; from it, walkers cross only at the
// bridges (sim.js footpaths), and the views draw the water. Days already published are untouched.

export const RIVER_DAY = 614;          // machine day; set past every day published at the deploy (see MASTER_PLAN.md)
export const RIVER_LAYOUT = 7;
export const riverOnDay = (day) => day >= RIVER_DAY;
export const riverOn = (machineTime) => Math.floor(machineTime / 24) + 1 >= RIVER_DAY;
// tests and the dev views may hold the river on or off whatever the day (null: by the day)
let FORCE = null;
export function forceRiver(v) { FORCE = v; }
export const riverShown = (machineTime) => (FORCE == null ? riverOn(machineTime) : FORCE);

export const NAME = "THE ATTRITION";
export const MOTTO = "EVERYTHING FLOWS OUT. NOTHING IS REPLACED.";
export const SEA_Y = 98;               // coastGeo.SEA_Y (held equal by check-river)

const hyp = Math.hypot;
// ---- the courses ----------------------------------------------------------------------------------
// [x, y, width, corner radius]: a polyline whose corners are filleted (circular arcs of that radius,
// shrunk where the legs are short), then sampled every STEP cells (a long straight keeps its two ends).
// Width is the water's, bank to bank, interpolated along the course between the control points.
const STEP = 0.5;
function course(ctrl) {
  const P = ctrl.map(([x, y, w, r]) => ({ x, y, w, r: r || 0 }));
  // the fillets: each interior vertex becomes [arc start, arc samples..., arc end]
  const raw = [{ x: P[0].x, y: P[0].y, w: P[0].w, c: 0 }];
  for (let i = 1; i < P.length - 1; i++) {
    const A = P[i - 1], B = P[i], C = P[i + 1];
    const l1 = hyp(B.x - A.x, B.y - A.y), l2 = hyp(C.x - B.x, C.y - B.y);
    const u1 = [(B.x - A.x) / l1, (B.y - A.y) / l1], u2 = [(C.x - B.x) / l2, (C.y - B.y) / l2];
    const cross = u1[0] * u2[1] - u1[1] * u2[0], dot = u1[0] * u2[0] + u1[1] * u2[1];
    const th = Math.atan2(Math.abs(cross), dot);   // the turn
    if (th < 1e-4 || !B.r) { raw.push({ x: B.x, y: B.y, w: B.w, c: i }); continue; }
    let t = B.r * Math.tan(th / 2);
    const tmax = 0.48 * Math.min(l1, l2);
    const r = t > tmax ? tmax / Math.tan(th / 2) : B.r;
    t = r * Math.tan(th / 2);
    const s = { x: B.x - u1[0] * t, y: B.y - u1[1] * t }, sgn = cross > 0 ? 1 : -1;
    const n1 = [-u1[1] * sgn, u1[0] * sgn], cx = s.x + n1[0] * r, cy = s.y + n1[1] * r;
    const a0 = Math.atan2(s.y - cy, s.x - cx), n = Math.max(2, Math.ceil((r * th) / 0.35));
    for (let k = 0; k <= n; k++) {
      const a = a0 + sgn * th * (k / n);
      raw.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), w: B.w, c: k === Math.round(n / 2) ? i : -1 });
    }
  }
  raw.push({ x: P[P.length - 1].x, y: P[P.length - 1].y, w: P[P.length - 1].w, c: P.length - 1 });
  // arclength, then the widths between the control points
  let s = 0;
  raw.forEach((p, i) => { if (i) s += hyp(p.x - raw[i - 1].x, p.y - raw[i - 1].y); p.s = s; });
  const anchors = raw.filter(p => p.c >= 0).map(p => [p.s, P[p.c].w]);
  const widthAt = (q) => {
    if (q <= anchors[0][0]) return anchors[0][1];
    for (let i = 1; i < anchors.length; i++) if (q <= anchors[i][0]) { const [s0, w0] = anchors[i - 1], [s1, w1] = anchors[i]; return w0 + (w1 - w0) * ((q - s0) / Math.max(1e-9, s1 - s0)); }
    return anchors[anchors.length - 1][1];
  };
  // resample: every STEP along each leg (a leg longer than 400 cells keeps only its ends and the
  // last 200 cells sampled: the run off the edge of the world)
  const pts = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (i) {
      const q = raw[i - 1], L = p.s - q.s, n = Math.ceil(L / STEP);
      const from = L > 400 ? n - Math.ceil(200 / STEP) : 1;
      for (let k = Math.max(1, from); k < n; k++) { const f = k / n; pts.push(pt(q.x + (p.x - q.x) * f, q.y + (p.y - q.y) * f, q.s + L * f)); }
    }
    pts.push(pt(p.x, p.y, p.s));
  }
  function pt(x, y, q) { return { x, y, s: q, w: widthAt(q) }; }
  // the direction at each point (downstream) and its left-hand normal
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = hyp(b.x - a.x, b.y - a.y) || 1;
    p.dx = (b.x - a.x) / l; p.dy = (b.y - a.y) / l;
  });
  return { pts, L: s, widthAt };
}

// THE ATTRITION, the main stem: from beyond the edge, down the seam, across the foothills, through the
// city, to the sea. (The run north is out past anything the view can reach at its widest.)
const MAIN_CTRL = [
  [-12, -6000, 1.2], [-12, -330, 1.2, 30], [-7.5, -235, 1.2, 25], [-11.5, -168, 1.2, 18], [-6.5, -128, 1.2, 10], [-10.5, -98, 1.2, 8],
  [-6.2, -78, 1.2, 6], [-6.2, -50, 1.3, 2],                       // THE MERGER: THE BURNOUT comes in
  [-6.2, -31, 1.5, 4], [2, -14, 1.5, 4],                          // the village's west end
  [26.5, -3.6, 1.5, 3],                                            // across THE FOOTHILLS
  [26.5, 18.4, 1.4, 2], [32.5, 18.4, 1.4, 2],                      // the Arts|Campus gutter, under the Loop, round the Diamond
  [32.5, 44.1, 1.4, 1.6], [26.5, 44.1, 1.4, 1.6],                  // between the Arena and DEPT HQ, under the Loop again
  [26.5, 74.2, 1.2, 1.6], [56.8, 74.2, 1.2, 1.6],                  // the Commons|Works gutter, behind the Pit (THE CHANNEL)
  [56.8, 79.4, 2.2, 3], [55.2, 83.4, 2.8, 3], [55.2, 87.6, 3.2, 3], // under the Shore Line, the gap to the sand
  [56.6, 91.4, 3.8, 3], [59.0, 94.2, 5.4, 3], [59.5, 97.0, 6.4, 3], // THE OUTPLACEMENT: the estuary
  [59.8, 100.5, 8.4, 3], [60.6, 107, 13],                              // the mouth, into the sea
];
// THE BURNOUT: the snowmelt, from the snowfield under THE GLASS CEILING down the west face (falls),
// into THE RETENTION POOL, out over the rapids to THE MERGER.
const MELT_CTRL = [
  [14.4, -86.6, 0.45], [11.6, -84.9, 0.55, 1.5], [8.4, -81.7, 0.6, 1.5], [7.3, -77.4, 0.7, 2], [6.5, -72.9, 0.75, 1.5],
  [5.4, -69.4, 0.8, 1.5], [3.6, -66.0, 0.85, 1.5], [2.2, -61.6, 0.9, 2], [0.2, -56.7, 0.95, 2], [-2.6, -52.4, 1.0, 2], [-6.2, -49.2, 1.1],
];
export const MAIN = { id: "attrition", name: NAME, ...course(MAIN_CTRL) };
export const MELT = { id: "burnout", name: "THE BURNOUT", sub: "SNOWMELT. RUNS DOWNHILL ON SCHEDULE.", ...course(MELT_CTRL) };
export const COURSES = [MAIN, MELT];
// THE RETENTION POOL: the mountain lake, on a graded bench of the west face (mountainGeo.js PADS)
export const TARN = { id: "retention-pool", name: "THE RETENTION POOL", sub: "NOTHING LEAVES WITHOUT AUTHORISATION. MOST THINGS DO.", x: 5.4, y: -69.4, rx: 3.0, ry: 2.1 };
// THE OUTPLACEMENT: where the course meets the sand (y 91.5) to the sea; its sandbars
export const ESTUARY = { id: "outplacement", name: "THE OUTPLACEMENT", sub: "THE ESTUARY. ALL FLOWS EXIT HERE.", y0: 91.5, bars: [{ x: 58.4, y: 97.4, rx: 1.3, ry: 0.45 }, { x: 61.6, y: 99.4, rx: 1.0, ry: 0.35 }] };

// Where on a course is a point: -> {i (the nearer sample), s, d (distance from the centreline), w}
export function nearest(C, x, y, i0 = 0, i1 = C.pts.length - 1) {
  let best = { i: -1, d: Infinity };
  for (let i = Math.max(1, i0); i <= i1; i++) {
    const a = C.pts[i - 1], b = C.pts[i], vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L2));
    const d = hyp(x - a.x - vx * t, y - a.y - vy * t);
    if (d < best.d) best = { i: t < 0.5 ? i - 1 : i, s: a.s + (b.s - a.s) * t, d, w: a.w + (b.w - a.w) * t, t, seg: i };
  }
  return best;
}
export const pointAt = (C, s) => {
  const P = C.pts;
  if (s <= 0) return P[0];
  let lo = 0, hi = P.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], f = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-9, b.s - a.s)));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, s, w: a.w + (b.w - a.w) * f, dx: a.dx, dy: a.dy };
};
const inEllipse = (E, x, y, pad = 0) => ((x - E.x) / (E.rx + pad)) ** 2 + ((y - E.y) / (E.ry + pad)) ** 2 < 1;
// What water is at a map point: "river" | "lake" | "estuary" | "ocean" | null. pad widens the banks.
export function waterAt(x, y, pad = 0) {
  if (inEllipse(TARN, x, y, pad)) return "lake";
  for (const C of COURSES) {
    const n = nearest(C, x, y);
    if (n.d <= n.w / 2 + pad) {
      if (C === MAIN && y >= ESTUARY.y0 && y < SEA_Y) return ESTUARY.bars.some(b => inEllipse(b, x, y)) ? null : "estuary";
      if (C === MAIN && y >= SEA_Y) return "ocean";
      return "river";
    }
  }
  return y >= SEA_Y && x >= -62 && x <= 112 ? "ocean" : null;
}

// ---- the bridges ------------------------------------------------------------------------------------
// kind: rail (a viaduct already over the street: its span over the water is a girder bridge, no pier
// in the river), road (the street carried across), foot (a footbridge), trail (timber, the forest's),
// boardwalk (the boardwalk's own deck). Every one but rail is walked across (a gap in the walking
// blocks, its deck `deck` cells wide along the river).
const BR = (id, name, kind, x, y, deck = 1.6) => ({ id, name, kind, x, y, deck });
const BRIDGE_LIST = [
  BR("br-trail", "THE TRAIL BRIDGE", "trail", 0, 0, 1.3),   // where the foothills' trail meets the river (placed below)
  BR("br-north", "THE NORTH STREET BRIDGE", "road", 26.5, -1.6, 2.4),
  BR("br-loop-north-pave", "THE ARTS STEPS", "foot", 26.5, 13.7, 1.6),
  BR("rb-loop-north", "THE LOOP (NORTH SPAN)", "rail", 26.5, 15.5),
  BR("br-diamond", "THE DIAMOND FOOTBRIDGE", "foot", 29.8, 18.4, 1.5),
  BR("br-plaza", "THE PLAZA FOOTBRIDGE", "foot", 32.5, 30.5, 1.6),
  BR("br-hq-south", "THE ADMINISTRATION BRIDGE", "road", 32.5, 40.2, 2.0),
  BR("rb-loop-south", "THE LOOP (SOUTH SPAN)", "rail", 32.5, 42.5),
  BR("br-works-steps", "THE WORKS STEPS", "foot", 29.6, 44.1, 1.5),
  BR("br-ration", "THE RATION BRIDGE", "foot", 26.5, 57.25, 1.4),
  BR("br-assembly", "THE ASSEMBLY BRIDGE", "foot", 26.5, 65.0, 1.4),
  BR("br-channel-west", "THE PIT STEPS", "foot", 30.2, 74.2, 1.5),
  BR("br-coast-central", "THE STATION BRIDGE", "road", 41.8, 74.2, 2.2),
  BR("br-channel-east", "THE FIGHT NIGHT BRIDGE", "foot", 50.6, 74.2, 1.5),
  BR("rb-shore", "THE SHORE LINE SPAN", "rail", 54.5, 74.2),
  BR("br-coast-road", "THE COAST ROAD BRIDGE", "road", 56.8, 77.6, 2.2),
  BR("br-severance", "THE SEVERANCE FOOTBRIDGE", "foot", 55.2, 84.6, 1.4),
  BR("br-boardwalk", "THE BOARDWALK", "boardwalk", 55.6, 89.5, 3.0),
  BR("br-farm-track", "THE FARM TRACK", "foot", -6.2, -40, 1.4),
];
// the trail bridge sits where the river crosses the foothills' trail (coastGeo FOOTHILLS.trail, held by check-river)
const TRAIL = [[10.5, -6.65], [21, -10.05], [33, -6.05]];
{
  const b = BRIDGE_LIST[0];
  for (let i = 1; i < TRAIL.length && !b.x; i++) {
    const [ax, ay] = TRAIL[i - 1], [bx, by] = TRAIL[i];
    for (let k = 0; k < 400; k++) { const x = ax + (bx - ax) * k / 400, y = ay + (by - ay) * k / 400, n = nearest(MAIN, x, y); if (n.d < 0.06) { b.x = x; b.y = y; break; } }
  }
}
export const BRIDGES = BRIDGE_LIST.map(b => {
  const n = nearest(MAIN, b.x, b.y), p = pointAt(MAIN, n.s);
  // the span across the water (banks plus a little), and which way the deck runs (across the flow)
  return { ...b, s: n.s, x: p.x, y: p.y, dx: p.dx, dy: p.dy, span: p.w + (b.kind === "rail" ? 1.4 : 1.0), walk: b.kind !== "rail" };
});
export const BRIDGE = Object.fromEntries(BRIDGES.map(b => [b.id, b]));

// ---- the walking blocks (sim.js footpaths) ------------------------------------------------------------
// The water as axis-aligned boxes over the main stem from the farm seam (y -100) to the sand, with a gap
// at every bridge a walker crosses: straight legs are one box each, bends and diagonals a run of short
// boxes. On the beach the estuary is one box per sample run. The mountain's water (THE BURNOUT, the
// pool) is out of every walk's way (held by check-river) and is not a block.
export const RIVER_BLOCKS = (() => {
  const P = MAIN.pts, gaps = BRIDGES.filter(b => b.walk).map(b => [b.s - b.deck / 2, b.s + b.deck / 2]);
  const inGap = (s) => gaps.some(([a, b]) => s > a && s < b);
  const out = [];
  let run = null;
  const flush = () => { if (run) out.push(run); run = null; };
  const straight = (a, b) => Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6;
  // a piece is cut at a bridge's deck edges, so the gap is the deck exactly
  const pieces = [];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i];
    if (b.y < -100 || a.y >= SEA_Y + 1) { pieces.push(null); continue; }
    const cuts = [a.s, ...gaps.flat().filter(c => c > a.s && c < b.s), b.s];
    for (let k = 1; k < cuts.length; k++) {
      const s0 = cuts[k - 1], s1 = cuts[k];
      if (inGap((s0 + s1) / 2)) { pieces.push(null); continue; }
      const at = (q) => { const f = (q - a.s) / Math.max(1e-9, b.s - a.s); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f, s: q }; };
      pieces.push([at(s0), at(s1)]);
    }
  }
  for (const pc of pieces) {
    if (!pc) { flush(); continue; }
    const [a, b] = pc;
    // the band's own quad (each end pushed out across the flow by half its width), boxed: an
    // axis-aligned piece is exactly its water, a slanted one a little more
    const L = hyp(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    const q = [[a, a.w / 2], [a, -a.w / 2], [b, b.w / 2], [b, -b.w / 2]].map(([p, k]) => [p.x + nx * k, p.y + ny * k]);
    const box = { x0: Math.min(...q.map(v => v[0])), y0: Math.min(...q.map(v => v[1])), x1: Math.max(...q.map(v => v[0])), y1: Math.max(...q.map(v => v[1])) };
    // a straight run grows one box; a bend or a diagonal starts a new box every ~1.5 cells
    const ax = straight(a, b) ? (Math.abs(a.x - b.x) < 1e-6 ? "v" : "h") : "d";
    if (run && run.ax === ax && ax !== "d" && (ax === "v" ? Math.abs(run.cx - a.x) < 1e-6 : Math.abs(run.cy - a.y) < 1e-6)) {
      run.x0 = Math.min(run.x0, box.x0); run.y0 = Math.min(run.y0, box.y0); run.x1 = Math.max(run.x1, box.x1); run.y1 = Math.max(run.y1, box.y1);
      continue;
    }
    if (run && ax === "d" && run.ax === "d" && run.len < 1.5) {
      run.x0 = Math.min(run.x0, box.x0); run.y0 = Math.min(run.y0, box.y0); run.x1 = Math.max(run.x1, box.x1); run.y1 = Math.max(run.y1, box.y1); run.len += b.s - a.s;
      continue;
    }
    flush();
    run = { ...box, ax, cx: a.x, cy: a.y, len: b.s - a.s };
  }
  flush();
  // (neighbouring slanted boxes overlap, which is what keeps the barrier closed)
  return out.map((o, k) => ({ id: `river:${k}`, x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1 }));
})();

// ---- the fishing spots (the fishing game reads these) ---------------------------------------------------
// water: ocean | river | lake | estuary. x, y: a point on the water (where the line goes in); stand:
// where the angler stands (dry, on a bank, the pier's deck or a bridge); place: the sim place they are
// at (NPC anglers later); district: the district it is in.
export const FISHING_SPOTS = [
  { id: "pier", name: "THE PIER", water: "ocean", x: 66, y: 102.6, stand: [66, 100.6], place: "pier", district: "coast", note: "THE END OF THE PIER. FISHING BY PERMIT. THE FISH HAVE NOT BEEN ASKED." },
  { id: "estuary", name: "THE OUTPLACEMENT", water: "estuary", x: 60.2, y: 95.6, stand: [62.9, 94.4], place: "beach", district: "coast", note: "THE ESTUARY. EVERYTHING THE CITY LETS GO OF PASSES HERE." },
  { id: "the-severance", name: "THE SEVERANCE", water: "river", x: 55.2, y: 82.2, stand: [52.9, 82.2], place: null, district: "coast", note: "THE LAST POOL BEFORE THE SEA. A BENCH. A FINAL OFFER." },
  { id: "the-break-room", name: "THE BREAK ROOM", water: "river", x: 26.5, y: 61.0, stand: [24.9, 61.0], place: null, district: "commons", note: "BETWEEN THE COMMONS AND THE WORKS. FIFTEEN MINUTES. LOGGED." },
  { id: "the-underpass", name: "THE UNDERPASS", water: "river", x: 26.5, y: 10.5, stand: [28.1, 10.5], place: null, district: "campus", note: "UNDER THE ARTS QUARTER'S WALL, BY THE LOOP. THE TRAINS DO NOT WAIT." },
  { id: "river", name: "THE COOLING-OFF PERIOD", water: "river", x: 20.2, y: -6.2, stand: [20.6, -4.6], place: "foothills", district: "heights", note: "A SLOW POOL IN THE FOOTHILLS. TEMPERS ARE RETURNED TO BASELINE." },
  { id: "the-merger", name: "THE MERGER", water: "river", x: -6.2, y: -46.6, stand: [-7.8, -44.2], place: null, district: "heights", note: "WHERE THE BURNOUT JOINS THE ATTRITION. TWO FLOWS, ONE HEADCOUNT." },
  { id: "lake", name: "THE RETENTION POOL", water: "lake", x: 5.4, y: -69.0, stand: [8.7, -69.6], place: null, district: "heights", note: "THE MOUNTAIN LAKE. STOCKED. NOTHING LEAVES WITHOUT AUTHORISATION." },
];
export const FISHING_SPOT = Object.fromEntries(FISHING_SPOTS.map(f => [f.id, f]));

// ---- the riverside: the path, the pocket parks, the benches -------------------------------------------
// The path along the east bank of the two gutters (the river's own street); THE SEVERANCE GARDEN in the
// gap by the sea; benches in the leftover ground. Drawn only (no sim place: the plans' places are fixed).
export const PATH = [
  [[28.2, 0.4], [28.2, 12.6]],
  [[27.9, 46.4], [27.9, 72.8]],
];
export const PARKS = [
  { id: "severance-garden", name: "THE SEVERANCE GARDEN", x0: 50.9, y0: 80.9, x1: 53.4, y1: 87.3, trees: [[51.6, 81.8], [52.2, 86.4]], benches: [[52.8, 82.2, "e"], [52.8, 84.0, "e"]], lamp: [51.4, 83.2] },
  { id: "waterfront", name: "THE WATERFRONT (MONITORED)", x0: 29.3, y0: 21.0, x1: 31.4, y1: 38.6, trees: [[30.1, 23.2], [30.1, 34.8]], benches: [[31.0, 27.0, "e"], [31.0, 30.0, "e"]], lamp: [30.1, 28.6] },
  { id: "break-room", name: "THE BREAK ROOM", x0: 24.3, y0: 58.2, x1: 25.5, y1: 63.8, trees: [], benches: [[25.0, 59.8, "e"], [25.0, 62.4, "e"]], lamp: [24.8, 61.1] },
];

// ---- a fast "is this wet" (the painters: no pine, towel or tree stands in the water) ---------------------
// The courses' samples in 4-cell buckets; the tarn and the sea by their shapes. pad widens the banks.
const WB = 4, WET = new Map();
for (const C of COURSES) for (let i = 1; i < C.pts.length; i++) {
  const a = C.pts[i - 1], b = C.pts[i];
  if (hyp(b.x - a.x, b.y - a.y) > 4) continue;   // the run off the edge of the world: nothing stands there
  for (const p of [a, b]) {
    const k = `${Math.floor(p.x / WB)}|${Math.floor(p.y / WB)}`;
    let l = WET.get(k); if (!l) WET.set(k, (l = [])); l.push([a, b]);
  }
}
export function wetAt(x, y, pad = 0) {
  if (inEllipse(TARN, x, y, pad)) return true;
  if (y >= SEA_Y - pad && x >= -62 && x <= 112) return true;
  const bx = Math.floor(x / WB), by = Math.floor(y / WB);
  for (let i = bx - 1; i <= bx + 1; i++) for (let j = by - 1; j <= by + 1; j++) {
    const l = WET.get(`${i}|${j}`);
    if (l) for (const [a, b] of l) {
      const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1e-12, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L2));
      if (hyp(x - a.x - vx * t, y - a.y - vy * t) <= a.w / 2 + (b.w - a.w) * t / 2 + pad) return true;
    }
  }
  return false;
}
// The rail bridges as the painters need them: a viaduct pier inside one is left out, a deck over one
// is hung on a truss. -> the bridge whose water a point is over (pad: beyond the banks), or null.
export const RAIL_BRIDGES = BRIDGES.filter(b => b.kind === "rail");
export const railBridgeAt = (x, y, pad = 0.4) => RAIL_BRIDGES.find(b => hyp(x - b.x, y - b.y) <= b.span / 2 + pad) || null;
