// THE MOVEMENT LOG, in a list (Scott, 2026-10-06: "next to people's names, when you see
// their lists, you should see their MOVEMENT LOG next to them"). Pure: the functions (the
// census, the market terms, the elections slate) encode, the browser decodes.
//
// A series is a file's last SPARK_MAX scores, oldest first, ending at the score on file. It
// rides the census row as `hx`: the deltas between consecutive scores, each a zigzag varint
// in base64url (5 bits a character, the sixth says "more"): a move under 16 points is one
// character, under 512 two. The score itself is already on the row, so the series costs
// `,"hx":"…"` = 8 bytes + about 1-2 a revision. No hx = no movement on file yet (NEW).
export const SPARK_MAX = 8;
const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const V = Object.fromEntries([...A].map((c, i) => [c, i]));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// scores (oldest first) -> hx ("" for fewer than two points)
export function encodeSeries(scores) {
  const p = (scores || []).filter(isNum).map(Math.round).slice(-SPARK_MAX);
  let out = "";
  for (let i = 1; i < p.length; i++) {
    const d = p[i] - p[i - 1];
    let z = d >= 0 ? 2 * d : -2 * d - 1;
    do { const lo = z & 31; z = Math.floor(z / 32); out += A[lo | (z ? 32 : 0)]; } while (z);
  }
  return out;
}
// hx + the score on file -> scores (oldest first); a bad string reads as no movement
export function decodeSeries(hx, last) {
  if (!isNum(last)) return null;
  const d = [];
  let z = 0, sh = 1;
  for (const c of String(hx || "")) {
    const v = V[c];
    if (v == null) return [last];
    z += (v & 31) * sh;
    if (v & 32) { sh *= 32; continue; }
    d.push(z % 2 ? -(z + 1) / 2 : z / 2);
    z = 0; sh = 1;
  }
  const out = [last];
  for (let i = d.length - 1; i >= 0; i--) out.unshift(out[0] - d[i]);
  return out;
}

// A movement log (src/movement.js shape, or a citizen's history) -> scores, oldest first,
// always ending at the score on file.
export function seriesOfLog(log, score) {
  const p = (Array.isArray(log) ? log : []).filter(h => h && !h.voided && isNum(h.score)).map(h => h.score);
  if (isNum(score) && p[p.length - 1] !== score) p.push(score);
  return p.slice(-SPARK_MAX);
}
// The census field: hx for a subject whose log has moved, else undefined (the key is left off).
export function hxOf(s) {
  const hx = encodeSeries(seriesOfLog(s?.scoreHistory, s?.score));
  return hx || undefined;
}

// "score history: 789 to 806, up 17 over 3 revisions"
export function sparkLabel(series) {
  const p = (series || []).filter(isNum);
  if (!p.length) return "";
  if (p.length === 1) return `score history: ${p[0]}, new on file`;
  const a = p[0], b = p[p.length - 1], d = b - a, n = p.length - 1;
  const how = d > 0 ? `up ${d}` : d < 0 ? `down ${-d}` : "unchanged";
  return `score history: ${a} to ${b}, ${how} over ${n} revision${n === 1 ? "" : "s"}`;
}
export const sparkDir = (series) => { const p = series || []; const d = p.length > 1 ? p[p.length - 1] - p[0] : 0; return d > 0 ? 1 : d < 0 ? -1 : 0; };

// Pixel geometry for a w x h box (whole pixels, so a 1px line stays crisp): -> {pts: [[x, y]],
// bars: [{x, y, w, h}]}. One point is a flat dash at mid-height. The vertical scale is never
// tighter than MIN_SPAN points, so a 5-point nudge reads as a nudge and not as a cliff.
export const MIN_SPAN = 40;
export function sparkGeom(series, w = 60, h = 14) {
  const p = (series || []).filter(isNum);
  if (!p.length) return { pts: [], bars: [] };
  const a = Math.min(...p), b = Math.max(...p), span0 = b - a;
  const span = span0 ? Math.max(span0, MIN_SPAN) : 0, lo = (a + b) / 2 - span / 2;
  const pad = 2, ih = h - 2 * pad, iw = w - 2 * pad - 2;   // room for the 2px endpoint dot
  const y = (v) => (span ? pad + Math.round((1 - (v - lo) / span) * ih) : Math.round(h / 2));
  const x = (i) => (p.length === 1 ? 0 : pad + Math.round((i / (p.length - 1)) * iw));
  const pts = p.length === 1 ? [[pad, y(p[0])], [Math.round(w / 2), y(p[0])]] : p.map((v, i) => [x(i), y(v)]);
  const bw = Math.max(1, Math.floor((w - pad * 2) / p.length) - 1);
  const bars = p.map((v, i) => { const top = span ? y(v) : pad + Math.round(ih / 2); return { x: pad + i * (bw + 1), y: top, w: bw, h: h - pad - top }; });
  return { pts, bars };
}
