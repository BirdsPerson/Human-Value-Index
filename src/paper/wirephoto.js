// WIRE PHOTOS for THE DAILY COMPLIANCE (docs/PAPER.md "Pictures"): low-resolution newspaper
// pictures drawn in the browser from what the site already has (the file sprites, the edition's
// own numbers), at 160x100 and halftoned to two inks, scaled up square-pixelled. Free: no model,
// no upload, nothing stored. Deterministic: the scene is chosen and laid out from the edition
// alone, seeded by the edition's date and the story, so an archived edition draws the same
// picture (a likeness drawn since then is the one thing that can sharpen).
//
// Rules for people (Scott's, for anything printed about real people): a picture shows only what
// the story's data says (two fighters in the ring the bout was in, a podium in finishing order,
// new files in the Intake queue); every person stands in the file sprite's neutral frame; only a
// name the edition marks drawable (ents p: listed on the board, no harm finding) is drawn; anyone
// else is left out of the picture. Every picture is captioned as a Department illustration.
//
// sceneOf(...) is pure (scripts/check-paper.mjs runs it); paint(...) is browser-only.
import { segments, readable, titleCase } from "./read.js";

export const PW = 160, PH = 100;
function h32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the people a line names, in order, who may be drawn: [{slug, name}]
export function drawable(text, m) {
  const out = [];
  for (const s of segments(text, m, new Set())) {
    const e = s.k && m.ents[s.k];
    if (e?.p && e.h?.startsWith("#market/") && !out.some(x => x.slug === e.h.slice(8))) out.push({ slug: e.h.slice(8), name: s.t });
  }
  return out;
}
const words = (s) => String(s || "").toUpperCase().replace(/^THE /, "").replace(/[^A-Z0-9 .:%+-]/g, "").trim();
const nameOf = (s, m) => readable(s, m);

// story h (a front-page headline object, or a section's own {kind, ...}), the edition, the matcher
// -> {kind, seed, who, sign, rows, score, caption} | null (no picture when the data cannot carry one)
export function sceneOf(h, ed, m) {
  if (!h || !ed) return null;
  const seed = h32(`${ed.date}|${h.kind}|${h.text || h.id || ""}`);
  const cap = (s) => `Department illustration. ${s}`;
  const k = h.kind;
  if (k === "pit") {
    const who = drawable(h.text, m).slice(0, 2);
    return { kind: "ring", seed, who, sign: "THE PIT", caption: cap(who.length === 2 ? `${who[0].name} and ${who[1].name} in the Pit's ring, from the bout record.` : "The Pit's ring, from the bout record.") };
  }
  if (k === "race") {
    const pod = (ed.sports?.race?.last?.podium || []).slice(0, 3);
    const who = pod.map(p => drawable(p.name, m)[0] || null);
    return { kind: "podium", seed, who, sign: words(ed.sports?.race?.last?.name || "THE RACE"), rows: pod.map(p => p.time), caption: cap(`The ${titleCase(ed.sports?.race?.last?.name || "race").toLowerCase()} podium on the mountain${pod.length ? `: ${pod.map(p => nameOf(p.name, m)).join(", ")}` : ""}.`) };
  }
  if (k === "result" || k === "champion") {
    const sc = (h.score || "").split("-");
    return { kind: "board", seed, sign: words(h.sport || "FINAL"), rows: k === "champion" ? [words(h.team), "CHAMPIONS"] : [words(h.winner), words(h.loser)], score: k === "champion" ? null : sc, caption: cap(k === "champion" ? `The scoreboard after the ${String(h.sport || "").toLowerCase()} final.` : `The scoreboard at full time: ${nameOf(h.winner, m)} ${sc[0] || ""}, ${nameOf(h.loser, m)} ${sc[1] || ""}.`) };
  }
  if (k === "table") {
    const rows = (h.rows || []).slice(0, 6);
    return { kind: "bars", seed, sign: words(h.sign), rows: rows.map(r => words(r.team).replace(/ (NINE|FIVE|ELEVEN)$/, "")), vals: rows.map(r => r.pts), caption: cap(`The ${h.sign.toLowerCase()} table at press time, points by club.`) };
  }
  if (k === "index" || k === "market" || k === "stabilizer" || k === "movers") {
    const mk = ed.markets;
    if (!mk) return null;
    const rows = [...(mk.up || []).slice(0, 3), ...(mk.down || []).slice(0, 3)];
    return { kind: "chart", seed, sign: `HVI ${mk.level}`, rows: rows.map(r => words(r.name).split(" ").slice(-1)[0]), vals: rows.map(r => parseFloat(String(r.chg).replace("−", "-"))), caption: cap(`The day's biggest movers on the market: ${rows.map(r => `${nameOf(r.name, m)} ${r.chg}`).join(", ")}.`) };
  }
  if (k === "arrivals") {
    const who = (ed.city?.arrivals?.released || []).map(x => drawable(typeof x === "string" ? x.split(",")[0] : x.text, m)[0]).filter(Boolean).slice(0, 5);
    return { kind: "queue", seed, who, sign: "INTAKE", caption: cap(`New files in the Intake queue${who.length ? `: ${who.map(w => w.name).join(", ")}` : ""}.`) };
  }
  if (k === "shop") return { kind: "store", seed, sign: words(h.text.replace(/^NOW OPEN: /, "")).slice(0, 24), caption: cap(`The new shopfront. ${readable(h.deck || "", m)}`) };
  if (k === "assembly" || k === "election") return { kind: "ballot", seed, sign: k === "assembly" ? "ASSEMBLY" : "COUNCIL", caption: cap(k === "assembly" ? "The Assembly's ballot box, sealed." : "The council polls, closed and counted.") };
  if (k === "record" || k === "river") return { kind: "fish", seed, sign: k === "river" ? "THE RIVER" : "RECORD", caption: cap(k === "river" ? "The new water, marked for anglers." : `The record catch, on the plaque. ${readable(h.deck || "", m)}`) };
  if (k === "tournament") return { kind: "board", seed, sign: "FINAL", rows: [words(h.text.split(" WINS ")[0]), "WINS"], score: null, caption: cap("The leaderboard at the close.") };
  // a district, a directive, the city at large
  const d = (ed.city?.districts || []).find(x => (h.text || "").includes(x.name) || h.district === x.name);
  const sign = k === "directive" ? words(h.directive || "CURFEW") : k === "mood" ? words(d?.word || "") : k === "emergence" ? "CLEARED" : k === "notice" ? "INSTALLED" : "";
  return { kind: "skyline", seed: h32(`${ed.date}|${d?.id || k}`), night: k === "directive", sign, caption: cap(`${d ? titleCase(d.name) : "The city"}${k === "directive" ? ", under curfew" : k === "mood" ? `, ${String(d?.word || "").toLowerCase()}` : ""}, at press time.`) };
}

// ---- the 3x5 type the boards and signs are lettered in ----------------------------------------
const GLYPH = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100", G: "011100101101011",
  H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101",
  O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010", U: "101101101101111",
  V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010", Z: "111001010100111",
  0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110", 4: "101101111001001", 5: "111100110001110", 6: "011100111101111",
  7: "111001010010010", 8: "111101111101111", 9: "111101111001110", "-": "000000111000000", ".": "000000000000010", ":": "000010000010000",
  "%": "101001010100101", "+": "000010111010000", "'": "010010000000000",
};
export const textW = (s, z = 1) => String(s).length * 4 * z - z;
function letter(ctx, s, x, y, z = 1, fill = "#fff") {
  ctx.fillStyle = fill;
  let cx = x;
  for (const ch of String(s).toUpperCase()) {
    const g = GLYPH[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(cx + (i % 3) * z, y + Math.floor(i / 3) * z, z, z);
    cx += 4 * z;
  }
}
const fit = (s, w, z = 1) => { s = String(s); while (s.length > 1 && textW(s, z) > w) s = s.slice(0, -1); return s; };

// ---- painting (browser) -------------------------------------------------------------------------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function hex(c) { const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim()); if (!m) { const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(c)); return r ? [+r[1], +r[2], +r[3]] : [0, 0, 0]; } const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const lumOf = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// person: a sprite sheet (canvas or image, frames 32x48 side by side) or null for a silhouette
function person(ctx, sheet, x, y, z, flip, R) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.translate(x + 32 * z, y); ctx.scale(-1, 1); } else ctx.translate(x, y);
  if (sheet) ctx.drawImage(sheet, 0, 0, 32, 48, 0, 0, 32 * z, 48 * z);
  else { ctx.fillStyle = "#222"; ctx.fillRect(11 * z, 4 * z, 10 * z, 10 * z); ctx.fillRect((8 + Math.floor(R() * 2)) * z, 15 * z, 16 * z, 18 * z); ctx.fillRect(10 * z, 33 * z, 5 * z, 13 * z); ctx.fillRect(17 * z, 33 * z, 5 * z, 13 * z); }
  ctx.restore();
}

export async function paint(canvas, scene, colors, loadSheet) {
  if (!canvas || !scene) return;
  canvas.width = PW; canvas.height = PH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const R = rng(scene.seed);
  const sheets = await Promise.all((scene.who || []).map(w => (w ? loadSheet(w.slug).catch(() => null) : null)));
  const g = (v) => `rgb(${v},${v},${v})`;
  ctx.fillStyle = g(200); ctx.fillRect(0, 0, PW, PH);
  const K = scene.kind;
  if (K === "ring") {
    const grd = ctx.createRadialGradient(80, 30, 5, 80, 50, 90); grd.addColorStop(0, g(235)); grd.addColorStop(1, g(60));
    ctx.fillStyle = grd; ctx.fillRect(0, 0, PW, PH);
    for (let i = 0; i < 60; i++) { ctx.fillStyle = g(30 + R() * 50); ctx.fillRect(R() * PW, R() * 26, 3, 3); }   // the crowd, risen
    ctx.fillStyle = g(215); ctx.fillRect(0, 84, PW, 16);
    ctx.fillStyle = g(20); ctx.fillRect(8, 30, 4, 60); ctx.fillRect(148, 30, 4, 60);
    for (const y of [44, 56, 68]) { ctx.fillStyle = g(250); ctx.fillRect(8, y, 144, 2); }
    person(ctx, sheets[0], 30, 18, 1.5, false, R);
    person(ctx, sheets[1], 82, 18, 1.5, true, R);
    letter(ctx, scene.sign, 80 - textW(scene.sign, 1) / 2, 92, 1, "#000");
  } else if (K === "podium") {
    ctx.fillStyle = g(235); ctx.fillRect(0, 0, PW, PH);
    ctx.fillStyle = g(120); ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(50, 12); ctx.lineTo(95, 50); ctx.lineTo(125, 22); ctx.lineTo(160, 55); ctx.lineTo(160, 100); ctx.lineTo(0, 100); ctx.fill();
    ctx.fillStyle = g(250); ctx.beginPath(); ctx.moveTo(40, 22); ctx.lineTo(50, 12); ctx.lineTo(60, 21); ctx.lineTo(54, 25); ctx.lineTo(47, 21); ctx.fill();
    for (let i = 0; i < 6; i++) { const x = 10 + i * 26 + R() * 8; ctx.fillStyle = i % 2 ? "#000" : g(90); ctx.fillRect(x, 60 + R() * 6, 2, 10); ctx.fillRect(x + 2, 60, 5, 4); }
    const spots = [[62, 70, 16, "1"], [26, 78, 8, "2"], [98, 82, 4, "3"]];
    spots.forEach(([x, top, , n], i) => {
      ctx.fillStyle = g(40); ctx.fillRect(x - 2, top, 36, PH - top);
      letter(ctx, n, x + 15, top + 3, 1, "#fff");
      if (scene.who?.[i] !== undefined) person(ctx, scene.who[i] ? sheets[i] : null, x, top - 48, 1, false, R);
    });
    letter(ctx, fit(scene.sign, 150), 4, 4, 1, "#000");
  } else if (K === "board") {
    ctx.fillStyle = g(170); ctx.fillRect(0, 0, PW, PH);
    for (let i = 0; i < 220; i++) { ctx.fillStyle = g(60 + R() * 120); ctx.fillRect(Math.floor(R() * PW), 70 + Math.floor(R() * 30), 2, 2); }
    ctx.fillStyle = "#000"; ctx.fillRect(14, 8, 132, 58);
    ctx.fillStyle = g(70); ctx.fillRect(16, 10, 128, 9);
    letter(ctx, fit(scene.sign, 120), 80 - textW(fit(scene.sign, 120)) / 2, 12, 1, "#fff");
    scene.rows.forEach((r, i) => {
      const y = 25 + i * 18;
      letter(ctx, fit(r, scene.score ? 90 : 122), 20, y, 1, "#fff");
      if (scene.score) letter(ctx, scene.score[i] || "", 140 - textW(scene.score[i] || "", 2), y - 2, 2, "#fff");
    });
  } else if (K === "bars" || K === "chart") {
    ctx.fillStyle = g(245); ctx.fillRect(0, 0, PW, PH);
    letter(ctx, fit(scene.sign, 150), 4, 3, 1, "#000");
    const n = scene.rows.length, vals = scene.vals.map(Number), max = Math.max(1e-9, ...vals.map(Math.abs));
    const rowH = Math.min(14, Math.floor(88 / Math.max(1, n)));
    scene.rows.forEach((r, i) => {
      const y = 12 + i * rowH, v = vals[i];
      letter(ctx, fit(r, 48), 3, y + 2, 1, "#000");
      const w = Math.round((Math.abs(v) / max) * 70);
      ctx.fillStyle = K === "chart" && v < 0 ? g(150) : g(25);
      ctx.fillRect(54, y + 1, Math.max(1, w), rowH - 4);
      const label = K === "chart" ? `${v > 0 ? "+" : ""}${v}%` : String(v);
      letter(ctx, fit(label, 30), Math.min(130, 57 + w), y + 2, 1, "#000");
    });
  } else if (K === "queue") {
    ctx.fillStyle = g(225); ctx.fillRect(0, 0, PW, PH);
    ctx.fillStyle = g(160); ctx.fillRect(0, 78, PW, 22);
    ctx.fillStyle = "#000"; ctx.fillRect(56, 4, 48, 11); letter(ctx, scene.sign, 80 - textW(scene.sign) / 2, 7, 1, "#fff");
    for (let i = 0; i < 6; i++) { ctx.fillStyle = g(90); ctx.fillRect(4 + i * 26, 62, 22, 2); }
    const n = Math.max(1, scene.who.length);
    scene.who.forEach((w, i) => person(ctx, sheets[i], 6 + i * (148 / n), 32, 1, false, R));
  } else if (K === "store") {
    ctx.fillStyle = g(215); ctx.fillRect(0, 0, PW, PH);
    ctx.fillStyle = g(110); ctx.fillRect(14, 10, 132, 80);
    ctx.fillStyle = "#000"; ctx.fillRect(18, 14, 124, 12); letter(ctx, fit(scene.sign, 118), 80 - textW(fit(scene.sign, 118)) / 2, 18, 1, "#fff");
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? g(250) : g(60); ctx.fillRect(18 + i * 15.5, 28, 15.5, 8); }
    ctx.fillStyle = g(240); ctx.fillRect(22, 42, 70, 40); ctx.fillStyle = g(30); ctx.fillRect(102, 42, 36, 48);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = g(80 + R() * 100); ctx.fillRect(26 + i * 13, 60 + R() * 10, 9, 20); }
  } else if (K === "ballot") {
    ctx.fillStyle = g(230); ctx.fillRect(0, 0, PW, PH);
    ctx.fillStyle = g(50); ctx.fillRect(50, 40, 60, 50); ctx.fillStyle = "#000"; ctx.fillRect(66, 40, 28, 3);
    ctx.fillStyle = g(250); ctx.fillRect(70, 18, 20, 26); ctx.fillStyle = "#000"; ctx.fillRect(74, 24, 4, 4); ctx.fillRect(74, 32, 10, 2);
    letter(ctx, scene.sign, 80 - textW(scene.sign) / 2, 62, 1, "#fff");
  } else if (K === "fish") {
    ctx.fillStyle = g(90); ctx.fillRect(0, 0, PW, PH);
    for (let y = 8; y < PH; y += 6) { ctx.fillStyle = g(130 + R() * 40); ctx.fillRect(0, y, PW, 1); }
    ctx.fillStyle = g(240); ctx.beginPath(); ctx.ellipse(76, 54, 40, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(112, 54); ctx.lineTo(136, 38); ctx.lineTo(136, 70); ctx.fill();
    ctx.fillStyle = "#000"; ctx.fillRect(48, 50, 4, 4);
    letter(ctx, scene.sign, 4, 4, 1, "#fff");
  } else {
    // skyline: the district's blocks, seeded by its id; lit windows by day, a curfew night dark
    ctx.fillStyle = scene.night ? g(40) : g(225); ctx.fillRect(0, 0, PW, PH);
    if (scene.night) { ctx.fillStyle = g(245); ctx.beginPath(); ctx.arc(128, 18, 8, 0, Math.PI * 2); ctx.fill(); }
    let x = 0;
    while (x < PW) {
      const w = 12 + Math.floor(R() * 22), top = 24 + Math.floor(R() * 50);
      ctx.fillStyle = scene.night ? g(10) : g(60 + Math.floor(R() * 70)); ctx.fillRect(x, top, w - 2, PH - top);
      for (let wy = top + 4; wy < PH - 6; wy += 6) for (let wx = x + 3; wx < x + w - 5; wx += 5) {
        if (R() < (scene.night ? 0.06 : 0.55)) { ctx.fillStyle = scene.night ? g(230) : g(235); ctx.fillRect(wx, wy, 2, 3); }
      }
      x += w;
    }
    if (scene.sign) { const t = fit(scene.sign, 120); ctx.fillStyle = "#000"; ctx.fillRect(4, 4, textW(t) + 6, 11); letter(ctx, t, 7, 7, 1, "#fff"); }
  }
  // halftone: luminance, a little contrast, a 4x4 ordered dither, two inks
  const ink = hex(colors.ink), paper = hex(colors.paper);
  const [dark, light] = lumOf(ink) <= lumOf(paper) ? [ink, paper] : [paper, ink];
  const img = ctx.getImageData(0, 0, PW, PH), d = img.data;
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const o = (y * PW + x) * 4;
    let v = (0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) / 255;
    v = Math.min(1, Math.max(0, (v - 0.5) * 1.25 + 0.5));
    const c = v * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5 ? light : dark;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
