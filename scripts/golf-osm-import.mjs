// THE DEPARTMENT OPEN: the real overhead shapes of each famous hole, from OpenStreetMap, OFFLINE.
// Writes src/play/golf/holes/osm.js; the game ships that data and never queries OSM at runtime.
//
// Map data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). The
// credit is printed on every hole card that uses these shapes (render.js, "MAP DATA (C) OSM").
//
// Per course: ONE Overpass query (the course outline, its golf=hole ways and every golf=green,
// fairway, bunker, tee, rough, water_hazard / lateral_water_hazard, natural=water polygon,
// waterway line and coastline round it), cached on disk, with a polite pause between courses. Then
// per hole: the golf=hole way with ref=<n> inside the named course (else none: the hole keeps its
// drawn shapes), the features nearest that hole's line, turned so tee -> green runs up the screen,
// scaled to the card's yardage, simplified to a modest vertex count, in yards.
//
// Usage: node scripts/golf-osm-import.mjs [--cache <dir>] [--only <id,id>] [--endpoint <url>]
// No copyrighted course imagery is used: only OSM vectors.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { FAMOUS } from "../src/play/golf/holes/famous.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg("--cache", join(tmpdir(), "hvi-golf-osm"));
const ONLY = arg("--only", "") ? new Set(arg("--only").split(",")) : null;
const ENDPOINTS = arg("--endpoint", "") ? [arg("--endpoint")] : ["https://lz4.overpass-api.de/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const UA = "hvi-golf-osm-import/1.0 (offline, one query per course, results cached)";
mkdirSync(CACHE, { recursive: true });

// The courses: a point on each, and the name OSM gives the course (a regex).
const COURSES = {
  pebble: { at: [36.5680, -121.9480], name: /pebble beach golf/i },
  oakmont: { at: [40.5265, -79.8275], name: /oakmont/i },
  augusta: { at: [33.5030, -82.0225], name: /augusta national/i },
  carnoustie: { at: [56.4975, -2.7215], name: /championship/i },
  troon: { at: [55.5290, -4.6450], name: /old course|royal troon/i },
  merion: { at: [39.9985, -75.3125], name: /merion.*east|east course|merion golf/i },
  bethpage: { at: [40.7445, -73.4545], name: /bethpage/i, hole: (t) => /black/i.test(t["golf:course:name"] || t["golf:course"] || "") },
  riviera: { at: [34.0490, -118.5015], name: /riviera/i },
  "pine-valley": { at: [39.7875, -74.9690], name: /pine valley/i },
  cypress: { at: [36.5810, -121.9660], name: /cypress point/i },
  straits: { at: [43.8515, -87.7340], name: /straits/i },
  sawgrass: { at: [30.1985, -81.3945], name: /tpc sawgrass/i, hole: (t) => /^stadium/i.test(t.name || "") },
  standrews: { at: [56.3445, -2.8045], name: /old course/i },
};
const courseOfId = (id) => id.replace(/-\d+$/, "");
const holeNoOfId = (id) => Number(id.match(/-(\d+)$/)[1]);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function overpass(key, q) {
  const file = join(CACHE, `${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const r = await fetch(url, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(150_000) });
      const t = await r.text();
      if (r.ok && t.trim().startsWith("{")) { writeFileSync(file, t); return JSON.parse(t); }
      console.warn(`  ${url}: ${r.status} ${t.slice(0, 120).replace(/\s+/g, " ")}`);
    } catch (e) { console.warn(`  ${url}: ${e.message}`); }
    await sleep(15_000 * (attempt + 1));   // back off: the public servers are shared
  }
  throw new Error(`overpass: no answer for ${key}`);
}
const query = ([lat, lon]) => `[out:json][timeout:120];
(
  way[leisure=golf_course](around:3000,${lat},${lon});
  relation[leisure=golf_course](around:3000,${lat},${lon});
  way[golf](around:2200,${lat},${lon});
  relation[golf](around:2200,${lat},${lon});
  way[natural=water](around:2200,${lat},${lon});
  relation[natural=water](around:2200,${lat},${lon});
  way[waterway~"^(stream|river|ditch|drain|canal)$"](around:2200,${lat},${lon});
  way[natural=coastline](around:2600,${lat},${lon});
);
out geom;`;

// ---- geometry ----------------------------------------------------------------------------------
const YD = 0.9144;
function localOf([lat0, lon0]) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  return (lat, lon) => [((lon - lon0) * kx) / YD, ((lat - lat0) * ky) / YD];
}
const ringsOf = (el) => {
  if (el.type === "way") return el.geometry ? [el.geometry.map(g => [g.lat, g.lon])] : [];
  // a relation: its outer members, joined end to end where they meet
  const parts = (el.members || []).filter(m => m.type === "way" && m.role !== "inner" && m.geometry).map(m => m.geometry.map(g => [g.lat, g.lon]));
  const rings = [];
  while (parts.length) {
    let ring = parts.shift();
    for (let guard = 0; guard < 400 && parts.length; guard++) {
      const end = ring[ring.length - 1];
      const i = parts.findIndex(p => (p[0][0] === end[0] && p[0][1] === end[1]) || (p[p.length - 1][0] === end[0] && p[p.length - 1][1] === end[1]));
      if (i < 0) break;
      let p = parts.splice(i, 1)[0];
      if (!(p[0][0] === end[0] && p[0][1] === end[1])) p = p.slice().reverse();
      ring = ring.concat(p.slice(1));
    }
    rings.push(ring);
  }
  return rings;
};
const closed = (pts) => pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const segDist = (px, py, [ax, ay], [bx, by]) => { const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)); return Math.hypot(px - ax - t * vx, py - ay - t * vy); };
const lineDist = (pts, x, y) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(x, y, pts[i - 1], pts[i])); return d; };
const lenOf = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const centroid = (pts) => { let a = 0, cx = 0, cy = 0; const n = pts.length; for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n], f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f; } if (Math.abs(a) < 1e-9) return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; return [cx / (3 * a), cy / (3 * a)]; };
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; } return Math.abs(a / 2); };
// Douglas-Peucker, then a cap on the vertex count (raise the tolerance until it fits)
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = 0, best = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i][0], pts[i][1], pts[0], pts[pts.length - 1]); if (d > best) { best = d; idx = i; } }
  if (best <= eps) return [pts[0], pts[pts.length - 1]];
  return dp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(dp(pts.slice(idx), eps));
}
function simplify(pts, eps, max, ring = true) {
  let p = ring && closed(pts) ? pts.slice(0, -1) : pts.slice();
  if (ring) {   // split the ring at its two farthest points so DP keeps its shape
    let i0 = 0, i1 = 0, far = 0;
    for (let i = 0; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > far) { far = d; i1 = i; } }
    const a = p.slice(i0, i1 + 1), b = p.slice(i1).concat([p[0]]);
    for (let e = eps; ; e *= 1.35) { const out = dp(a, e).slice(0, -1).concat(dp(b, e).slice(0, -1)); if (out.length <= max || e > 40) return out; }
  }
  for (let e = eps; ; e *= 1.35) { const out = dp(p, e); if (out.length <= max || e > 40) return out; }
}
const r1 = (v) => Math.round(v * 10) / 10;
// Sutherland-Hodgman: a polygon cut to an axis-aligned box (a lake becomes the part of it by the hole)
function clipBox(pts, [x0, y0, x1, y1]) {
  let out = pts;
  const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]], [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]], [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]]];
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) return out;
  }
  return out;
}

// ---- one hole ------------------------------------------------------------------------------------
function importHole(d, data, C) {
  const n = holeNoOfId(d.id), els = data.elements;
  // the course outline: the named one nearest the point
  const toLL = (r) => r;
  const courses = els.filter(e => e.tags?.leisure === "golf_course").map(e => ({ e, rings: ringsOf(e).filter(r => r.length > 3), name: e.tags.name || "" }));
  const named = courses.filter(c => C.name.test(c.name));
  const outline = (named.length ? named : courses).sort((a, b) => b.rings.reduce((s, r) => s + r.length, 0) - a.rings.reduce((s, r) => s + r.length, 0))[0];
  const inCourse = (lat, lon) => !outline || outline.rings.some(r => inPoly(r.map(([a, o]) => [o, a]), lon, lat));
  // the hole: golf=hole, ref n, inside the course
  const holes = els.filter(e => e.type === "way" && e.tags?.golf === "hole" && e.geometry);
  const cands = holes.filter(e => String(e.tags.ref || "").trim().replace(/^[^0-9]*-\s*/, "") === String(n) && inCourse(e.geometry[0].lat, e.geometry[0].lon) && (!C.hole || C.hole(e.tags)));
  if (!cands.length) return { miss: `no golf=hole ref=${n} in ${outline?.name || "the course"}` };
  const hole = cands.sort((a, b) => b.geometry.length - a.geometry.length)[0];
  const ll = hole.geometry.map(g => [g.lat, g.lon]);
  const loc = localOf(ll[0]);
  const raw = ll.map(([a, o]) => loc(a, o));
  // turn: tee -> green straight up; scale to the card
  const [ex, ey] = raw[raw.length - 1], ang = Math.atan2(ex, ey), cs = Math.cos(ang), sn = Math.sin(ang);
  const L = lenOf(raw), k = d.yards / L;
  const T = ([x, y]) => [(x * cs - y * sn) * k, (x * sn + y * cs) * k];
  const P = (lat, lon) => T(loc(lat, lon));
  const line = raw.map(T);
  const otherLines = holes.filter(e => e.id !== hole.id && inCourse(e.geometry[0].lat, e.geometry[0].lon) && (!C.hole || C.hole(e.tags))).map(e => e.geometry.map(g => P(g.lat, g.lon)));
  const len = d.yards, inBox = (x, y, pad = 0) => y > -60 - pad && y < len + 90 + pad && Math.abs(x) < 170 + pad;
  const mine = (cx, cy) => { const dm = lineDist(line, cx, cy); return otherLines.every(o => lineDist(o, cx, cy) >= dm - 1); };
  const out = { way: hole.id, course: outline?.name || "", scale: r1(k * 1000) / 1000, line: simplify(line, 1.5, 6, false).map(p => p.map(r1)), green: null, tee: [], fairway: [], bunker: [], water: [], rough: [], stream: [], coast: [] };
  const kindOf = (t) => {
    if (!t) return null;
    if (t.golf === "green") return "green";
    if (t.golf === "fairway") return "fairway";
    if (t.golf === "bunker") return "bunker";
    if (t.golf === "tee") return "tee";
    if (t.golf === "rough") return "rough";
    if (t.golf === "water_hazard" || t.golf === "lateral_water_hazard" || t.natural === "water") return "water";
    if (t.waterway) return "stream";
    if (t.natural === "coastline") return "coast";
    return null;
  };
  const greens = [];
  for (const e of els) {
    const kind = kindOf(e.tags);
    if (!kind) continue;
    for (const ring of ringsOf(e)) {
      const pts = ring.map(([a, o]) => P(a, o));
      if (kind === "stream" || kind === "coast") {
        const near = pts.filter(([x, y]) => inBox(x, y, 40));
        if (near.length < 2) continue;
        // keep the run of the line that passes through the box (plus a point either side)
        const idx = pts.map((p, i) => (inBox(p[0], p[1], 40) ? i : -1)).filter(i => i >= 0);
        const seg = pts.slice(Math.max(0, idx[0] - 1), Math.min(pts.length, idx[idx.length - 1] + 2));
        const w = kind === "stream" ? (e.tags.waterway === "river" ? 12 : e.tags.waterway === "stream" ? 4 : 3) : 0;
        out[kind].push(kind === "stream" ? { w, pts: simplify(seg, 1, 40, false).map(p => p.map(r1)) } : simplify(seg, 2, 60, false).map(p => p.map(r1)));
        continue;
      }
      if (!closed(ring) && e.type === "way") continue;
      const [cx, cy] = centroid(pts);
      if (kind === "green") { greens.push(pts); continue; }
      if (kind === "water") {   // water is shared: any pond that reaches into the hole's box
        if (!pts.some(([x, y]) => inBox(x, y)) && !inPoly(pts, 0, len / 2)) continue;
        const cut = clipBox(closed(pts) ? pts.slice(0, -1) : pts, [-200, -90, 200, len + 130]);
        if (cut.length >= 3) out.water.push(simplify(cut, 1.2, 56).map(p => p.map(r1)));
        continue;
      }
      if (!inBox(cx, cy) || !mine(cx, cy)) continue;
      if (kind === "tee" && Math.hypot(cx, cy) > 70) continue;
      if (kind === "fairway" && lineDist(line, cx, cy) > 60) continue;
      if (kind === "bunker" && lineDist(line, cx, cy) > 75) continue;   // far off the hole: never in play
      out[kind].push(simplify(pts, kind === "bunker" ? 0.6 : 1, kind === "bunker" ? 20 : kind === "rough" ? 40 : 36).map(p => p.map(r1)));
    }
  }
  // the green: the one at the end of the line (contains it, else nearest)
  const [gx, gy] = line[line.length - 1];
  const g = greens.map(p => ({ p, d: inPoly(p, gx, gy) ? 0 : Math.min(...p.map(q => Math.hypot(q[0] - gx, q[1] - gy))) })).sort((a, b) => a.d - b.d)[0];
  if (!g || g.d > 30) return { miss: `no golf=green at the end of hole ${n}` };
  out.green = simplify(g.p, 0.4, 32).map(p => p.map(r1));
  out.greenArea = Math.round(area(out.green));
  void toLL;
  return out;
}

// ---- main ----------------------------------------------------------------------------------------
const want = FAMOUS.filter(d => !ONLY || ONLY.has(d.id));
const byCourse = new Map();
for (const d of want) { const c = courseOfId(d.id); if (!byCourse.has(c)) byCourse.set(c, []); byCourse.get(c).push(d); }
const prev = (() => { try { const s = readFileSync(join(root, "src/play/golf/holes/osm.js"), "utf8"); return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); } catch { return {}; } })();
const OUT = ONLY ? { ...prev } : {};
const report = [];
let first = true;
for (const [c, list] of byCourse) {
  const C = COURSES[c];
  if (!C) { list.forEach(d => report.push(`${d.id}: no course entry`)); continue; }
  const cached = existsSync(join(CACHE, `${c}.json`));
  if (!first && !cached) await sleep(8000);   // polite: one query per course, spaced out
  first = false;
  console.log(`${c}: ${cached ? "cached" : "querying"}`);
  let data;
  try { data = await overpass(c, query(C.at)); } catch (e) { list.forEach(d => report.push(`${d.id}: FALLBACK (${e.message})`)); continue; }
  for (const d of list) {
    const r = importHole(d, data, C);
    if (r.miss) { report.push(`${d.id}: FALLBACK (${r.miss})`); delete OUT[d.id]; continue; }
    OUT[d.id] = r;
    report.push(`${d.id}: OSM way ${r.way} (${r.course}); green ${r.green.length} pts ${r.greenArea} sq yd; ${r.fairway.length} fairway, ${r.bunker.length} bunker, ${r.tee.length} tee, ${r.water.length} water, ${r.stream.length} stream, ${r.coast.length} coast, ${r.rough.length} rough; scale ${r.scale}`);
  }
}
const body = JSON.stringify(OUT);
writeFileSync(join(root, "src/play/golf/holes/osm.js"),
  `// GENERATED by scripts/golf-osm-import.mjs from OpenStreetMap. Do not edit by hand: re-run the script.\n` +
  `// Map data (c) OpenStreetMap contributors, available under the Open Database License (ODbL 1.0):\n` +
  `// https://www.openstreetmap.org/copyright. Shapes are in yards, tee at (0, 0), the green up the screen,\n` +
  `// scaled to the card's yardage. Holes missing here keep their drawn (organic) shapes.\n` +
  `export const OSM_CREDIT = "MAP DATA (C) OPENSTREETMAP CONTRIBUTORS";\n` +
  `export const OSM = ${body};\n`);
console.log(report.join("\n"));
console.log(`wrote src/play/golf/holes/osm.js (${(body.length / 1024).toFixed(1)} KB, ${Object.keys(OUT).length} holes)`);
