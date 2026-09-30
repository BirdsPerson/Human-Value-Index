// RAIL LINES as first-class things (docs/planning/MASTER_PLAN.md, PHASE 2 step 1). Pure: no
// sim imports, so sim.js builds its lines from here and scripts/check-plans.mjs can hold them.
//
// A line is a closed arc (s, cells) that its trains run round on a fixed timetable from machine
// hour 0, stops at arcs on it, and trains of cars. THE LOOP (sim.js) is line 0: a ring, one stop
// per station. Every other line is a SHUTTLE: a double-track viaduct along a centreline (an
// orthogonal polyline with round corners), out on one track and back on the other, folded into
// one arc of 2L: s in [0, L] is the outbound track, s in [L, 2L] the inbound (u = 2L - s). Each
// station has two stops (a platform per track, on its own side). At each end the tracks close
// to one over a stub (THE TERMINAL): the train runs in on one side of the stub, stands, and
// leaves on the other (a push-pull: the lead car becomes the tail), so the turn takes no arc
// the cars ever ride: the arrival and departure stops are the same place.
//
// Timetable principles (MASTER_PLAN "PHASE 2"): each line is its own clock (adding or changing
// one never moves another's trains); a line is never retimed in place: a change is a new version
// with its own id and index, and the old one keeps running for any published day that names it.

export const TRACK = 0.6;          // cells from the centreline to each track, on the double track
export const EDGE = 0.65;          // the deck beyond a track (the Loop's own half-width)
export const TERM = 4.6;           // a terminal's stopping point, cells from the end of the stub
export const TAPER = [9, 14];      // the tracks close to one between these (cells from an end)

const mod = (v, m) => ((v % m) + m) % m;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// The centreline: an orthogonal polyline with a radius-R curve at each turn, sampled densely.
// -> {pts: [[x, y]], cum: [arc], L, at(u) -> {x, y, tx, ty}, straights: [{a, b, u0, u1, d}], corners: [...]}
export function centreline(pts, R) {
  const out = [[pts[0][0], pts[0][1]]], straights = [], corners = [];
  const dirOf = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };
  let cur = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], din = dirOf(pts[i - 1], p);
    const last = i === pts.length - 1;
    const dout = last ? null : dirOf(p, pts[i + 1]);
    const end = last ? p : [p[0] - din[0] * R, p[1] - din[1] * R];
    straights.push({ a: cur, b: end, d: din });
    out.push(end);
    if (!last) {
      // the quarter circle from end to p + dout * R, centred inside the turn
      const c = [end[0] + dout[0] * R, end[1] + dout[1] * R];
      const N = 12;
      for (let k = 1; k <= N; k++) {
        const th = (k / N) * Math.PI / 2;
        // from end (at -dout from the centre) round to +din from the centre
        out.push([c[0] - dout[0] * R * Math.cos(th) + din[0] * R * Math.sin(th), c[1] - dout[1] * R * Math.cos(th) + din[1] * R * Math.sin(th)]);
      }
      corners.push({ x: p[0], y: p[1], cx: c[0], cy: c[1], din, dout, R });
      cur = out[out.length - 1];
    }
  }
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  const L = cum[cum.length - 1];
  // arcs of the straights and corners along u
  let u = 0, si = 0;
  for (let i = 0; i < straights.length; i++) {
    const st = straights[i], len = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]);
    st.u0 = u; st.u1 = u + len; u += len;
    if (corners[i]) { corners[i].u0 = u; corners[i].u1 = u + R * Math.PI / 2; u = corners[i].u1; }
    si++;
  }
  function at(q) {
    q = Math.max(0, Math.min(L, q));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= q) lo = m; else hi = m; }
    const a = out[lo], b = out[hi], seg = cum[hi] - cum[lo] || 1, f = (q - cum[lo]) / seg;
    const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, tx, ty };
  }
  return { pts: out, cum, L, at, straights, corners, R };
}

// A shuttle line. spec: {id, index, version, name, short, prefix (train ids), color, pts, R,
// stations: [{id, name, district, at: [x, y]}] in order from the first terminal (the first and
// last are the terminals, placed TERM from each end), cars: [n per train], speed (cells an
// hour), dwell, layover (hours standing at a terminal before leaving), base?: (u) -> storeys
// under the deck (a line up a mountain)}.
export function shuttle(spec) {
  const C = centreline(spec.pts, spec.R), L = C.L;
  const lat = (u) => TRACK * smooth((u - TAPER[0]) / (TAPER[1] - TAPER[0])) * smooth((L - u - TAPER[0]) / (TAPER[1] - TAPER[0]));
  const base = spec.base || (() => 0);
  // s -> the point on the track (lateral offset included), its heading, and u
  function at(s) {
    s = mod(s, 2 * L);
    const out = s <= L, u = out ? s : 2 * L - s, c = C.at(u), k = lat(u) * (out ? 1 : -1);
    return { x: c.x - c.ty * k, y: c.y + c.tx * k, dx: out ? c.tx : -c.tx, dy: out ? c.ty : -c.ty, u };
  }
  const project = ([x, y]) => {
    let best = 0, bd = Infinity;
    for (let q = 0; q <= L; q += 0.25) { const p = C.at(q), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = q; } }
    return best;
  };
  const stations = spec.stations.map((st, i, all) => {
    const u = i === 0 ? TERM : i === all.length - 1 ? L - TERM : project(st.at);
    return { ...st, lineId: spec.id, u, terminal: i === 0 ? "first" : i === all.length - 1 ? "last" : null, stops: [] };
  });
  // two stops per station: out (s = u, platform on the outbound track's side), in (s = 2L - u)
  const stops = [];
  for (const st of stations) {
    for (const dir of ["out", "in"]) {
      const s = dir === "out" ? st.u : 2 * L - st.u, p = at(s), c = C.at(st.u);
      const side = dir === "out" ? 1 : -1, n = { x: -c.ty * side, y: c.tx * side };
      const dwell = (dir === "out" && st.terminal === "first") || (dir === "in" && st.terminal === "last") ? spec.layover : spec.dwell;
      const stop = {
        id: `${spec.id}:${st.id}:${dir}`, stationId: st.id, lineId: spec.id, line: spec.index, dir, districtId: st.district, name: st.name,
        s, u: st.u, x: p.x, y: p.y, n, d: { x: p.dx, y: p.dy }, dwell, base: base(st.u), terminal: st.terminal,
        arrival: (dir === "out" && st.terminal === "last") || (dir === "in" && st.terminal === "first"),
      };
      stops.push(stop); st.stops.push(stop.id);
    }
  }
  stops.sort((a, b) => a.s - b.s);
  const ARR = [];
  let t = 0;
  stops.forEach((st, i) => {
    const next = stops[(i + 1) % stops.length];
    st.index = i; st.next = next.id; st.gap = mod(next.s - st.s, 2 * L);
    st.lapOffset = t; ARR.push(t);
    // the turn at a terminal takes no arc a car rides (the arrival and departure are one place)
    const turn = st.arrival && next.stationId === st.stationId;
    t += st.dwell + (turn ? 0 : st.gap / spec.speed);
    st.run = turn ? 0 : st.gap / spec.speed;
  });
  ARR.push(t);
  const lap = t, headway = lap / spec.cars.length;
  const trains = spec.cars.map((cars, k) => ({ id: `${spec.prefix}${k + 1}`, index: k, line: spec.id, name: `${spec.short} ${k + 1}`, cars }));
  return { ...spec, kind: "shuttle", centre: C, L, length: 2 * L, lat, base, at, stations, stops, ARR, lap, headway, trains };
}

// Train k of a line at machine hour T: the arc of its middle, and whether it stands at a stop.
export function lineTrainState(line, k, T) {
  const tau = mod(T - k * line.headway, line.lap), ARR = line.ARR;
  let i = line.stops.length - 1;
  while (i > 0 && ARR[i] > tau) i--;
  const st = line.stops[i], dt = tau - ARR[i];
  if (dt < st.dwell) return { mid: st.s, dwell: true, stationId: st.id, nextStationId: st.next, since: dt };
  return { mid: st.s + Math.min(dt - st.dwell, st.run) * line.speed, dwell: false, stationId: null, lastStationId: st.id, nextStationId: st.next };
}
// The first train to reach stop i at or after machine hour t -> {trainId, k, arrive, depart}.
export function lineNextArrival(line, i, t) {
  const j = Math.ceil((t - line.ARR[i]) / line.headway - 1e-9);
  const arrive = line.ARR[i] + j * line.headway, k = mod(j, line.trains.length);
  return { trainId: line.trains[k].id, k, stationId: line.stops[i].id, arrive, depart: arrive + line.stops[i].dwell };
}
// Hours from standing at stop a to standing at stop b, riding the line.
export const lineRide = (line, a, b) => mod(line.stops[b].lapOffset - line.stops[a].lapOffset, line.lap);
