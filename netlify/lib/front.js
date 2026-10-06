// THE FRONT PAGE's small windows (Scott, 2026-10-06: "not just who's trending UP, also who's
// trending DOWN"; a news ticker; a trending ticker; a tiny view of the city). Pure: the functions
// (/api/market?ticker=1, /api/front, /api/cam) build from what they read; check-front.mjs checks.
//   moversOf(board)          the day's top risers and fallers, each with its "because"
//   newsOf(edition, wire)    THE DAILY COMPLIANCE's latest headlines, then its live WIRE
//   trendingOf({...})        who the city is looking at: most seen, score moves, league stars, INTAKE
//   camSvg(clock, trains)    SUBSTRATE.CAM: the city's overview as a small SVG at the machine hour
import { validHref, printable } from "./paper.js";
import { decodeSeries } from "../../src/ui/spark.js";

const up = (s) => String(s || "").toUpperCase();
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const num = (v) => typeof v === "number" && Number.isFinite(v);
export const FRONT_N = 5;

// ---- MARKET.TKR: risers and fallers ----------------------------------------------------------
// The board already ranks them (netlify/lib/market.js boardOf: movers.up / movers.down). Kept
// small: the landing asks every minute.
export function moversOf(board, n = FRONT_N) {
  const row = (r) => ({ slug: r.slug, name: up(r.name), price: Math.round(r.price * 100) / 100, chg: Math.round(r.chg * 10000) / 10000, why: clip(up(r.why), 96), ...(num(r.score) ? { score: r.score } : {}), ...(r.hx ? { hx: r.hx } : {}) });   // score + hx: the MOVEMENT LOG sparkline
  const ok = (r) => r && typeof r.slug === "string" && num(r.price) && num(r.chg);
  return {
    up: (board?.movers?.up || []).filter(r => ok(r) && r.chg > 0).slice(0, n).map(row),
    down: (board?.movers?.down || []).filter(r => ok(r) && r.chg < 0).slice(0, n).map(row),
  };
}

// ---- the news: the latest edition's front page, then the live WIRE ---------------------------
// A headline opens the edition it was printed in (the story is there); a WIRE line opens where it
// happened. The WIRE's market lines are left out: MARKET.TKR already carries the movers.
const KIND_TAG = { notice: "NOTICE", result: "SPORT", directive: "ORDER", river: "CITY", mood: "CITY", arrivals: "INTAKE", shop: "TRADE", assembly: "ASSEMBLY", election: "COUNCIL", market: "MARKET" };
export function newsOf(edition, wire = [], n = 12) {
  const out = [];
  if (edition?.front) {
    const at = edition.date ? `#paper/${edition.date}` : "#paper";
    for (const s of [edition.front.lead, ...(edition.front.stories || [])].filter(Boolean)) {
      out.push({ tag: s === edition.front.lead ? "FRONT PAGE" : KIND_TAG[s.kind] || "NEWS", text: clip(up(s.text), 110), href: at });
    }
  }
  for (const w of wire || []) {
    if (!w?.text || String(w.href || "").startsWith("#market/")) continue;
    out.push({ tag: "WIRE", at: w.at || null, text: clip(up(w.text), 110), href: validHref(w.href) ? w.href : "#paper" });
  }
  return out.filter(x => x.text && printable(x.text)).slice(0, n);
}

// ---- trending: who the city is looking at right now -------------------------------------------
// Four sources, interleaved so one line walks across them: MOST SEEN (the market's crowd term,
// the figures seen most in public today), SCORE MOVE (the newest, largest move in a file's
// movement log), STAR (each league's star of the day, from the edition), INTAKE (new arrivals).
const CAUSE_WORD = { method: "THE DEPARTMENT'S METHOD", record: "THE PUBLIC RECORD, RE-READ", review: "A CASE REVIEW", vouch: "A VOUCH", visit: "AN INTERVIEW", appeal: "AN APPEAL" };
const findHref = (slug) => (/^[a-z0-9-]{1,80}$/.test(slug || "") ? `#city?find=${slug}` : "#city");
export function scoreMoves(board, figures = [], n = 3) {
  const moves = [];
  for (const r of board?.rows || []) {
    if (!r.hx || !num(r.score)) continue;
    const p = decodeSeries(r.hx, r.score);
    if (p && p.length > 1) moves.push({ slug: r.slug, name: up(r.name), from: p[p.length - 2], to: p[p.length - 1], at: 0, cause: null });
  }
  if (!moves.length) {
    for (const f of figures) {
      const h = (f.scoreHistory || []).filter(x => num(x?.score));
      if (h.length < 2) continue;
      const a = h[h.length - 2], b = h[h.length - 1];
      moves.push({ slug: f.slug, name: up(f.name), from: a.score, to: b.score, at: Date.parse(b.at) || 0, cause: b.cause || null });
    }
  }
  return moves.filter(m => m.to !== m.from)
    .sort((a, b) => b.at - a.at || Math.abs(b.to - b.from) - Math.abs(a.to - a.from) || (a.name < b.name ? -1 : 1))
    .slice(0, n)
    .map(m => ({ tag: "SCORE MOVE", text: `${m.name} ${m.to > m.from ? "▲" : "▼"} ${m.from} → ${m.to}${m.cause && CAUSE_WORD[m.cause] ? `, BY ${CAUSE_WORD[m.cause]}` : ""}`, href: m.slug ? findHref(m.slug) : "#scores" }));
}
export function trendingOf({ board, edition, arrivals, figures = [] }, n = 12) {
  const seen = (board?.rows || []).filter(r => num(r?.terms?.crowd) && r.terms.crowd > 0 && !r.halted)
    .sort((a, b) => b.terms.crowd - a.terms.crowd || (a.slug < b.slug ? -1 : 1)).slice(0, 3)
    .map((r, i) => ({ tag: "MOST SEEN", text: `${up(r.name)}, NO. ${i + 1} IN PUBLIC TODAY`, href: findHref(r.slug) }));
  const moves = scoreMoves(board, figures);
  const stars = (edition?.sports?.leagues || []).filter(l => l?.star?.name).slice(0, 4)
    .map(l => ({ tag: "STAR", text: `${up(l.name)}: ${up(l.star.name)}${l.star.stat ? `, ${up(l.star.stat)}` : ""}`, href: validHref(l.href) ? l.href : "#city/league" }));
  const fresh = [...(arrivals?.pending || []), ...(arrivals?.released || [])]
    .filter(a => a?.name).sort((a, b) => (Date.parse(b.filedAt) || 0) - (Date.parse(a.filedAt) || 0)).slice(0, 3)
    .map(a => ({ tag: "INTAKE", text: `NEW ON FILE: ${up(a.name)}${num(a.score) ? ` (${a.score})` : ""}`, href: "#arrivals" }));
  const lanes = [seen, moves, stars, fresh], out = [];
  for (let i = 0; out.length < n && lanes.some(l => l[i]); i++) for (const l of lanes) if (l[i] && out.length < n) out.push({ ...l[i], text: clip(l[i].text, 110) });
  return out.filter(x => printable(x.text));
}

// ---- SUBSTRATE.CAM ---------------------------------------------------------------------------
// The overview the city opens on (src/city/CityMap.jsx), drawn low: district blocks, the Loop and
// its platforms, every line, every train where the timetable has it, at the machine hour. Night
// (CityIso's nightAt: 19:00 to 06:30) darkens the ground and lights the windows. One real minute
// is one machine hour, so the image is asked for once a minute.
export const nightAt = (hour) => hour >= 19 || hour < 6.5;
const pad2 = (v) => String(v).padStart(2, "0");
const f1 = (v) => Math.round(v * 10) / 10;
export function camSvg({ clock, layout, ring, stations, lines, trains, carLen }) {
  const night = nightAt(clock.hour + clock.minute / 60);
  const P = night
    ? { bg: "#03060b", blk: "#08111c", edge: "#1e3a5f", rail: "#1e4a5a", txt: "#9fc3e8", lit: "#ffaa2d", sky: "NIGHT" }
    : { bg: "#0a140c", blk: "#12301c", edge: "#3d8a58", rail: "#2f6a42", txt: "#c8f5d8", lit: null, sky: "DAY" };
  const W = layout.cols, H = layout.rows, sx = 1, sy = 14 / 8;   // cells are 8 x 14: x in cells, y stretched
  const X = (x) => f1(x * sx), Y = (y) => f1(y * sy);
  const parts = [`<rect width="${X(W)}" height="${Y(H)}" fill="${P.bg}"/>`];
  for (const b of layout.blocks) {
    parts.push(`<rect x="${X(b.x)}" y="${Y(b.y)}" width="${X(b.w)}" height="${Y(b.h)}" fill="${P.blk}" stroke="${P.edge}" stroke-width="1.2"/>`);
    if (P.lit) {   // lit windows: a few per block, placed by the block's id (the same every night)
      let h = 0; for (const c of b.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const k = Math.max(2, Math.round((b.w * b.h) / 120));
      for (let i = 0; i < k; i++) { h = (h * 1103515245 + 12345) >>> 0; const px = b.x + 1 + (h % 1000) / 1000 * (b.w - 3); h = (h * 1103515245 + 12345) >>> 0; const py = b.y + 1 + (h % 1000) / 1000 * (b.h - 2); parts.push(`<rect x="${X(px)}" y="${Y(py)}" width="1.6" height="1.6" fill="${P.lit}"/>`); }
    }
  }
  const r = { x: ring.x + layout.ox, y: ring.y + layout.oy, w: ring.w, h: ring.h };
  parts.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${X(r.w)}" height="${Y(r.h)}" fill="none" stroke="${P.rail}" stroke-width="2.4"/>`);
  for (const st of stations) parts.push(`<rect x="${X(st.x + layout.ox) - 1.5}" y="${Y(st.y + layout.oy) - 1.5}" width="3" height="3" fill="#0e7490"/>`);
  for (const l of lines) {
    if (!l.pts?.length) continue;
    parts.push(`<polyline points="${l.pts.map(p => `${X(p[0] + layout.ox)},${Y(p[1] + layout.oy)}`).join(" ")}" fill="none" stroke="${l.color}" stroke-opacity="0.6" stroke-width="1.6"/>`);
  }
  for (const t of trains) for (const c of t.cars) {
    const a = t.at(c.s - carLen / 2), b = t.at(c.s + carLen / 2);
    parts.push(`<line x1="${X(a.x + layout.ox)}" y1="${Y(a.y + layout.oy)}" x2="${X(b.x + layout.ox)}" y2="${Y(b.y + layout.oy)}" stroke="${t.color}" stroke-width="3.4"/>`);
  }
  const label = `DAY ${clock.day} // ${pad2(clock.hour)}:${pad2(clock.minute)} // ${P.sky}`;
  const fs = Math.round(W / 22);
  parts.push(`<rect x="0" y="${Y(H) - fs * 1.7}" width="${X(W)}" height="${fs * 1.7}" fill="#000" fill-opacity="0.72"/>`);
  parts.push(`<text x="${fs * 0.6}" y="${Y(H) - fs * 0.5}" font-family="Fira Mono,Menlo,monospace" font-size="${fs}" font-weight="700" fill="${P.txt}">${label}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${X(W)} ${Y(H)}" role="img" aria-label="THE CITY AT ${label}"><title>THE CITY, ${label}</title>${parts.join("")}</svg>`;
}
